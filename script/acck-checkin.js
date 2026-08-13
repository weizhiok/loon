// ACCK AC币每日签到
// Version: 2.5.0
// 参数结构完全对齐 japan-auto-switch-v3：argument=[{arg1},{arg2}]

const VERSION = "2.5.0";
const TITLE = "ACCK AC币签到 v" + VERSION;
const API_BASE = "https://sign-service.lucffee.com";
const SHOP_PATH = "/api/auth/user/ac-shop";
const CHECKIN_PATH = "/api/auth/user/ac-shop/checkin";
const TOKEN_PARAMETER_KEY = "arg1";
const MARKER_PARAMETER_KEY = "arg2";
// 保留 v2.3.0 的缓存键，避免升级后丢失已经成功保存的 Token。
const TOKEN_CACHE_KEY = "acckTokenCacheFixedV230";
// Loon $httpClient 的 timeout 单位是毫秒。
const REQUEST_TIMEOUT_MS = 30000;
const REQUEST_ROUTES = [
  { name: "RULE", node: "" },
  { name: "DIRECT", node: "DIRECT" }
];
let preferredRouteName = "";

// 与 japan-auto-switch-v3 完全相同的主参数读取方式。
const args =
  typeof $argument === "object" && $argument !== null ? $argument : {};

function persistentRead(key) {
  try {
    if (
      typeof $persistentStore !== "undefined" &&
      $persistentStore &&
      typeof $persistentStore.read === "function"
    ) {
      const value = $persistentStore.read(key);
      return value == null ? "" : String(value);
    }
  } catch (error) {}
  return "";
}

function persistentWrite(value, key) {
  try {
    if (
      typeof $persistentStore !== "undefined" &&
      $persistentStore &&
      typeof $persistentStore.write === "function"
    ) {
      return !!$persistentStore.write(String(value), key);
    }
  } catch (error) {}
  return false;
}

function normalizeToken(value) {
  if (value == null) return "";
  let token = String(value).trim();
  if (!token) return "";
  token = token.replace(/^Bearer\s+/i, "").trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  return token;
}

function tokenShape(token) {
  if (!token) return "empty";
  return "len=" + token.length + ",jwtParts=" + token.split(".").length;
}

function argumentKeys() {
  try {
    return Object.keys(args).join(",");
  } catch (error) {
    return "";
  }
}

function resolveToken() {
  // 1. 和已成功插件一致：直接读取 $argument.arg1。
  let token = normalizeToken(args.arg1);
  if (token) {
    persistentWrite(token, TOKEN_CACHE_KEY);
    return { token: token, source: "argument.arg1" };
  }

  // 2. 官方文档允许按 [Argument] 参数名直接读取持久化值。
  token = normalizeToken(persistentRead(TOKEN_PARAMETER_KEY));
  if (token) {
    persistentWrite(token, TOKEN_CACHE_KEY);
    return { token: token, source: "persistentStore.arg1" };
  }

  // 3. 兼容 Loon 把单个值直接作为字符串传入的情况。
  if (typeof $argument === "string") {
    token = normalizeToken($argument);
    if (token) {
      persistentWrite(token, TOKEN_CACHE_KEY);
      return { token: token, source: "argument.string" };
    }
  }

  // 4. 最近一次成功读取的本地缓存。
  token = normalizeToken(persistentRead(TOKEN_CACHE_KEY));
  if (token) return { token: token, source: "persistentStore.cache" };

  return { token: "", source: "none" };
}

function markerValue() {
  const fromArgument = args.arg2 == null ? "" : String(args.arg2).trim();
  if (fromArgument) return fromArgument;
  return persistentRead(MARKER_PARAMETER_KEY).trim();
}

function safeText(value, maxLength) {
  let text = "";
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch (error) {
    text = String(value);
  }
  if (!text) return "";
  if (maxLength && text.length > maxLength) {
    return text.slice(0, maxLength) + "...(truncated,len=" + text.length + ")";
  }
  return text;
}

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch (error) {
    return null;
  }
}

function finish(message) {
  // 结果单独占一行，便于在 Loon 日志中直接辨认和复制。
  console.log("[" + TITLE + "] 最终结果：");
  console.log(message);
  try {
    $notification.post(TITLE, "", message);
  } catch (error) {}
  $done();
}

function failure(parts) {
  const detail = parts
    .filter(Boolean)
    .map(function (part) {
      return String(part).replace(/[\r\n]+/g, " ").trim();
    })
    .join(" | ");
  return "【签到失败！详情：" + detail + "】";
}

function sleep(milliseconds) {
  return new Promise(function (resolve) {
    setTimeout(resolve, milliseconds);
  });
}

function extractBalance(json) {
  if (!json || typeof json !== "object") return null;
  const candidates = [
    json.balance,
    json.ac_balance,
    json.acBalance,
    json.points,
    json.coin,
    json.data && json.data.balance
  ];

  for (let index = 0; index < candidates.length; index++) {
    const value = candidates[index];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (
      typeof value === "string" &&
      value.trim() !== "" &&
      !Number.isNaN(Number(value))
    ) {
      return Number(value);
    }
  }
  return null;
}

function collectFeedback(json, bodyText) {
  const output = [];
  if (typeof bodyText === "string" && bodyText.trim()) {
    output.push(bodyText.trim());
  }
  if (json && typeof json === "object") {
    const keys = ["error", "message", "msg", "detail", "reason", "title"];
    for (let index = 0; index < keys.length; index++) {
      const value = json[keys[index]];
      if (value != null && String(value).trim()) {
        output.push(String(value).trim());
      }
    }
  }
  return output;
}

function duplicateFeedback(json, bodyText) {
  return collectFeedback(json, bodyText).some(function (text) {
    return text.indexOf("今日已签到") !== -1;
  });
}

function successFeedback(json, bodyText) {
  return collectFeedback(json, bodyText).some(function (text) {
    return (
      text.indexOf("签到成功") !== -1 ||
      (/获得\s*\d+\s*(?:AC币|积分|AC)/i.test(text) &&
        text.indexOf("今日已签到") === -1)
    );
  });
}

function extractReward(json, bodyText, fallback) {
  const feedback = collectFeedback(json, bodyText);
  for (let index = 0; index < feedback.length; index++) {
    const match = feedback[index].match(
      /获得\s*(\d+)\s*(?:AC币|积分|AC)?/i
    );
    if (match) return Number(match[1]);
  }
  return fallback;
}

function buildHeaders(token) {
  return {
    Authorization: "Bearer " + token,
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    Origin: "https://acck.io",
    Referer: "https://acck.io/console/ac-store",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 " +
      "Mobile/15E148 Safari/604.1"
  };
}

function requestOnce(method, path, token, route) {
  return new Promise(function (resolve) {
    const url = API_BASE + path;
    const options = {
      url: url,
      method: method,
      headers: buildHeaders(token),
      timeout: REQUEST_TIMEOUT_MS,
      alpn: "h1"
    };
    if (route.node) options.node = route.node;
    if (method !== "GET" && method !== "HEAD") options.body = "{}";

    const clientMethod = method.toLowerCase();
    if (
      typeof $httpClient === "undefined" ||
      !$httpClient ||
      typeof $httpClient[clientMethod] !== "function"
    ) {
      resolve({
        transportOk: false,
        method: method,
        url: url,
        route: route.name,
        status: null,
        error: "$httpClient." + clientMethod + " unavailable",
        bodyText: "",
        json: null
      });
      return;
    }

    $httpClient[clientMethod](options, function (error, response, data) {
      const statusValue = response && (response.status || response.statusCode);
      const status = statusValue == null ? null : Number(statusValue);
      const bodyText =
        typeof data === "string"
          ? data
          : data == null
            ? ""
            : safeText(data, 4000);

      // 400“今日已签到”可能伴随 error；只要有 HTTP 响应就保留正文供判断。
      resolve({
        transportOk: !error || status != null,
        method: method,
        url: url,
        route: route.name,
        status: status,
        error: error ? String(error) : "",
        bodyText: bodyText,
        json: parseJson(data)
      });
    });
  });
}

function retryable(result) {
  const errorText = String(result.error || "").toLowerCase();
  return (
    result.status == null ||
    errorText.indexOf("timeout") !== -1 ||
    errorText.indexOf("timed out") !== -1 ||
    errorText.indexOf("connect") !== -1 ||
    errorText.indexOf("network") !== -1 ||
    errorText.indexOf("socket") !== -1 ||
    errorText.indexOf("dns") !== -1 ||
    errorText.indexOf("no such file or directory") !== -1 ||
    result.status === 429 ||
    result.status === 502 ||
    result.status === 503 ||
    result.status === 504
  );
}

function orderedRoutes() {
  if (!preferredRouteName) return REQUEST_ROUTES.slice();
  return REQUEST_ROUTES.slice().sort(function (left, right) {
    if (left.name === preferredRouteName) return -1;
    if (right.name === preferredRouteName) return 1;
    return 0;
  });
}

function routeTrace(result) {
  const attempts = result && result.attempts ? result.attempts : [];
  if (!attempts.length) return "none";
  return attempts
    .map(function (item) {
      return (
        item.route +
        "#" +
        item.attempt +
        ":status=" +
        item.status +
        ",error=" +
        safeText(item.error || "none", 240)
      );
    })
    .join(" -> ");
}

async function request(method, path, token, stage) {
  let result = null;
  const attempts = [];
  const routes = orderedRoutes();

  for (let index = 0; index < routes.length; index++) {
    const route = routes[index];
    result = await requestOnce(method, path, token, route);
    result.attempt = index + 1;
    result.stage = stage;
    attempts.push({
      route: result.route,
      attempt: result.attempt,
      status: result.status,
      error: result.error
    });
    result.attempts = attempts.slice();

    console.log(
      "[" + TITLE + "] HTTP | stage=" + stage +
        ",method=" + method +
        ",route=" + result.route +
        ",attempt=" + result.attempt +
        ",status=" + result.status +
        ",transportOk=" + result.transportOk +
        ",error=" + safeText(result.error || "none", 500)
    );

    if (result.transportOk && !retryable(result)) {
      preferredRouteName = route.name;
      return result;
    }

    if (!retryable(result)) return result;
    if (index < routes.length - 1) await sleep(500);
  }
  return result;
}

async function main() {
  const resolved = resolveToken();
  const token = resolved.token;
  const marker = markerValue();
  const debug =
    "version=" + VERSION +
    ",tokenSource=" + resolved.source +
    ",tokenShape=" + tokenShape(token) +
    ",argumentType=" + typeof $argument +
    ",argumentKeys=" + argumentKeys() +
    ",marker=" + (marker || "empty") +
    ",requestTimeoutMs=" + REQUEST_TIMEOUT_MS +
    ",routeFallback=RULE>DIRECT" +
    ",persistentArg1=" + (persistentRead(TOKEN_PARAMETER_KEY) ? "has_value" : "empty") +
    ",persistentArg2=" + (persistentRead(MARKER_PARAMETER_KEY) ? "has_value" : "empty");

  console.log("[" + TITLE + "] Script start | " + debug);

  if (!token) {
    finish(
      failure([
        "阶段=读取Token",
        debug,
        marker
          ? "参数通道已生效，但 arg1 为空；请重新填写 ACCK Token 并保存"
          : "参数通道未生效；请确认安装并运行的是 固定插件中的手动签到"
      ])
    );
    return;
  }

  const beforeResponse = await request(
    "GET",
    SHOP_PATH,
    token,
    "读取签到前积分"
  );

  if (!beforeResponse.transportOk) {
    finish(
      failure([
        "阶段=读取签到前积分",
        "error=" + beforeResponse.error,
        "status=" + beforeResponse.status,
        "attempt=" + beforeResponse.attempt,
        "route=" + beforeResponse.route,
        "routeTrace=" + routeTrace(beforeResponse),
        "url=" + beforeResponse.url,
        "body=" + safeText(beforeResponse.bodyText, 1200),
        debug
      ])
    );
    return;
  }

  if (beforeResponse.status === 401 || beforeResponse.status === 403) {
    finish(
      failure([
        "阶段=Token鉴权",
        "status=" + beforeResponse.status,
        "body=" + safeText(beforeResponse.bodyText, 1200),
        "判断=Token可能失效",
        debug
      ])
    );
    return;
  }

  if (!(beforeResponse.status >= 200 && beforeResponse.status < 300)) {
    finish(
      failure([
        "阶段=读取签到前积分HTTP异常",
        "status=" + beforeResponse.status,
        "route=" + beforeResponse.route,
        "routeTrace=" + routeTrace(beforeResponse),
        "body=" + safeText(beforeResponse.bodyText, 1200),
        debug
      ])
    );
    return;
  }

  const before = extractBalance(beforeResponse.json);
  if (before == null) {
    finish(
      failure([
        "阶段=解析签到前积分",
        "body=" + safeText(beforeResponse.bodyText, 1500),
        debug
      ])
    );
    return;
  }

  const checkinResponse = await request(
    "POST",
    CHECKIN_PATH,
    token,
    "执行签到"
  );

  if (!checkinResponse.transportOk) {
    finish(
      failure([
        "阶段=执行签到",
        "签到前积分=" + before,
        "error=" + checkinResponse.error,
        "status=" + checkinResponse.status,
        "attempt=" + checkinResponse.attempt,
        "route=" + checkinResponse.route,
        "routeTrace=" + routeTrace(checkinResponse),
        "url=" + checkinResponse.url,
        "body=" + safeText(checkinResponse.bodyText, 1200),
        debug
      ])
    );
    return;
  }

  const isDuplicate = duplicateFeedback(
    checkinResponse.json,
    checkinResponse.bodyText
  );
  const isSuccess = successFeedback(
    checkinResponse.json,
    checkinResponse.bodyText
  );
  const websiteFeedback = collectFeedback(
    checkinResponse.json,
    checkinResponse.bodyText
  ).join(" || ");

  const afterResponse = await request(
    "GET",
    SHOP_PATH,
    token,
    "读取签到后积分"
  );
  let after = null;
  let afterOk = false;
  let afterDetail = "";

  if (!afterResponse.transportOk) {
    afterDetail =
      "afterError=" + afterResponse.error +
      ",afterStatus=" + afterResponse.status +
      ",afterAttempt=" + afterResponse.attempt +
      ",afterRoute=" + afterResponse.route +
      ",afterRouteTrace=" + routeTrace(afterResponse);
  } else if (!(afterResponse.status >= 200 && afterResponse.status < 300)) {
    afterDetail =
      "afterStatus=" + afterResponse.status +
      ",afterBody=" + safeText(afterResponse.bodyText, 800);
  } else {
    after = extractBalance(afterResponse.json);
    afterOk = after != null;
    if (!afterOk) {
      afterDetail =
        "无法解析签到后积分,afterBody=" +
        safeText(afterResponse.bodyText, 800);
    }
  }

  // 重复签到：必须有网站“今日已签到”反馈，并且积分无变化。
  if (isDuplicate && afterOk && after === before) {
    finish("【重复签到！获得 0 AC币，当前总AC币" + after + "】");
    return;
  }

  // 签到成功：必须有网站成功反馈，并且积分增加。
  if (isSuccess && afterOk && after > before) {
    const reward = extractReward(
      checkinResponse.json,
      checkinResponse.bodyText,
      after - before
    );
    finish(
      "【签到成功！获得 " + reward + " AC币，当前总AC币" + after + "】"
    );
    return;
  }

  finish(
    failure([
      "阶段=签到结果校验",
      "签到前积分=" + before,
      "签到后积分=" + (afterOk ? after : "未知"),
      "积分差值=" + (afterOk ? after - before : "未知"),
      "checkinStatus=" + checkinResponse.status,
      "checkinRoute=" + checkinResponse.route,
      "checkinRouteTrace=" + routeTrace(checkinResponse),
      "checkinError=" + checkinResponse.error,
      "checkinBody=" + safeText(checkinResponse.bodyText, 1500),
      "网站反馈=" + safeText(websiteFeedback, 1000),
      "duplicateFeedback=" + isDuplicate,
      "successFeedback=" + isSuccess,
      afterDetail,
      debug
    ])
  );
}

main().catch(function (error) {
  finish(
    failure([
      "阶段=未捕获异常",
      "version=" + VERSION,
      "error=" + String(error && error.message ? error.message : error),
      "stack=" + safeText(error && error.stack ? error.stack : "", 1500)
    ])
  );
});
