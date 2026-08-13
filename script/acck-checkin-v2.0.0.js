// ACCK AC币每日签到
// Version: 2.0.0
// 参数优先从 $persistentStore.read("acckToken") 读取；$argument 仅作兼容兜底。

const VERSION = "2.0.0";
const TITLE = "ACCK AC币签到 v" + VERSION;
const API_BASE = "https://sign-service.lucffee.com";
const SHOP_PATH = "/api/auth/user/ac-shop";
const CHECKIN_PATH = "/api/auth/user/ac-shop/checkin";
const ARG_TOKEN_KEY = "acckToken";
const TOKEN_CACHE_KEY = "acckTokenCacheV2";
const REQUEST_TIMEOUT = 25;
const MAX_RETRY = 1;
const RETRY_DELAY_MS = 1000;

const rawArgument = typeof $argument !== "undefined" ? $argument : undefined;

console.log(
  "[" + TITLE + "] Script start" +
  " | version=" + VERSION +
  " | argumentType=" + typeof rawArgument
);

function finish(message) {
  console.log("[" + TITLE + "] " + message);
  try {
    $notification.post(TITLE, "", message);
  } catch (e) {}
  $done();
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function safeJson(value, maxLength) {
  let text = "";
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch (e) {
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
  } catch (e) {
    return null;
  }
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
  } catch (e) {}
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
  } catch (e) {}
  return false;
}

function tokenFromArgument() {
  if (typeof rawArgument === "string") {
    return normalizeToken(rawArgument);
  }
  if (!rawArgument || typeof rawArgument !== "object") return "";

  const keys = [ARG_TOKEN_KEY, "token", "auth_token", "authToken"];
  for (let i = 0; i < keys.length; i++) {
    const value = rawArgument[keys[i]];
    if (value != null && String(value).trim()) return normalizeToken(value);
  }
  return "";
}

function resolveToken() {
  // 官方推荐方式：[Argument] 的用户输入可直接按参数名从 persistentStore 读取。
  let token = normalizeToken(persistentRead(ARG_TOKEN_KEY));
  if (token) {
    persistentWrite(token, TOKEN_CACHE_KEY);
    return { token: token, source: "persistentStore.acckToken" };
  }

  token = tokenFromArgument();
  if (token) {
    persistentWrite(token, TOKEN_CACHE_KEY);
    return { token: token, source: "argument" };
  }

  token = normalizeToken(persistentRead(TOKEN_CACHE_KEY));
  if (token) return { token: token, source: "persistentStore.cache" };

  return { token: "", source: "none" };
}

function tokenShape(token) {
  if (!token) return "empty";
  const parts = token.split(".");
  return "len=" + token.length + ",jwtParts=" + parts.length;
}

function extractBalance(json) {
  if (!json || typeof json !== "object") return null;
  const values = [
    json.balance,
    json.ac_balance,
    json.acBalance,
    json.points,
    json.coin,
    json.data && json.data.balance
  ];
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
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

function feedbackTexts(json, bodyText) {
  const texts = [];
  if (typeof bodyText === "string" && bodyText.trim()) texts.push(bodyText.trim());
  if (json && typeof json === "object") {
    const keys = ["error", "message", "msg", "detail", "reason", "title"];
    for (let i = 0; i < keys.length; i++) {
      const value = json[keys[i]];
      if (value != null && String(value).trim()) texts.push(String(value).trim());
    }
  }
  return texts;
}

function hasDuplicateFeedback(json, bodyText) {
  return feedbackTexts(json, bodyText).some(function (text) {
    return text.indexOf("今日已签到") !== -1;
  });
}

function hasSuccessFeedback(json, bodyText) {
  return feedbackTexts(json, bodyText).some(function (text) {
    return (
      text.indexOf("签到成功") !== -1 ||
      (/获得\s*\d+\s*(?:AC币|积分|AC)/i.test(text) &&
        text.indexOf("今日已签到") === -1)
    );
  });
}

function extractReward(json, bodyText, fallback) {
  const texts = feedbackTexts(json, bodyText);
  for (let i = 0; i < texts.length; i++) {
    const match = texts[i].match(/获得\s*(\d+)\s*(?:AC币|积分|AC)?/i);
    if (match) return Number(match[1]);
  }
  return fallback;
}

function isRetryable(error, status) {
  const text = String(error || "").toLowerCase();
  return (
    text.indexOf("timeout") !== -1 ||
    text.indexOf("timed out") !== -1 ||
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function headers(token) {
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

function requestOnce(method, path, token) {
  return new Promise(function (resolve) {
    const url = API_BASE + path;
    const options = {
      url: url,
      method: method,
      headers: headers(token),
      timeout: REQUEST_TIMEOUT
    };
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
            : safeJson(data, 4000);

      // 有 HTTP 响应时，即使 Loon 同时给出 error，也要保留响应供“今日已签到”判断。
      resolve({
        transportOk: !error || status != null,
        method: method,
        url: url,
        status: status,
        error: error ? String(error) : "",
        bodyText: bodyText,
        json: parseJson(data)
      });
    });
  });
}

async function request(method, path, token, stage) {
  let result = null;
  for (let attempt = 1; attempt <= MAX_RETRY + 1; attempt++) {
    result = await requestOnce(method, path, token);
    result.attempt = attempt;
    result.stage = stage;
    if (result.transportOk || !isRetryable(result.error, result.status)) return result;
    if (attempt <= MAX_RETRY) await sleep(RETRY_DELAY_MS * attempt);
  }
  return result;
}

function failure(parts) {
  return "签到失败！失败详情：" + parts.filter(Boolean).join(" | ");
}

async function main() {
  const resolved = resolveToken();
  const token = resolved.token;
  const commonDebug =
    "version=" + VERSION +
    ",tokenSource=" + resolved.source +
    ",tokenShape=" + tokenShape(token) +
    ",argumentType=" + typeof rawArgument +
    ",persistentArg=" + (persistentRead(ARG_TOKEN_KEY) ? "has_value" : "empty");

  console.log("[" + TITLE + "] Token resolved | " + commonDebug);

  if (!token) {
    finish(
      failure([
        "阶段=读取Token",
        commonDebug,
        "处理方法=确认安装的是 v2.0.0 插件，并在 ACCK Token 中重新填写后保存"
      ])
    );
    return;
  }

  const beforeResponse = await request("GET", SHOP_PATH, token, "读取签到前积分");
  if (!beforeResponse.transportOk) {
    finish(
      failure([
        "阶段=读取签到前积分",
        "error=" + beforeResponse.error,
        "status=" + beforeResponse.status,
        "attempt=" + beforeResponse.attempt,
        "url=" + beforeResponse.url,
        "body=" + safeJson(beforeResponse.bodyText, 1200),
        commonDebug
      ])
    );
    return;
  }
  if (beforeResponse.status === 401 || beforeResponse.status === 403) {
    finish(
      failure([
        "阶段=Token鉴权",
        "status=" + beforeResponse.status,
        "body=" + safeJson(beforeResponse.bodyText, 1200),
        "判断=Token可能失效",
        commonDebug
      ])
    );
    return;
  }
  if (!(beforeResponse.status >= 200 && beforeResponse.status < 300)) {
    finish(
      failure([
        "阶段=读取签到前积分HTTP异常",
        "status=" + beforeResponse.status,
        "body=" + safeJson(beforeResponse.bodyText, 1200),
        commonDebug
      ])
    );
    return;
  }

  const before = extractBalance(beforeResponse.json);
  if (before == null) {
    finish(
      failure([
        "阶段=解析签到前积分",
        "body=" + safeJson(beforeResponse.bodyText, 1500),
        commonDebug
      ])
    );
    return;
  }

  const checkinResponse = await request("POST", CHECKIN_PATH, token, "执行签到");
  if (!checkinResponse.transportOk) {
    finish(
      failure([
        "阶段=执行签到",
        "签到前积分=" + before,
        "error=" + checkinResponse.error,
        "status=" + checkinResponse.status,
        "attempt=" + checkinResponse.attempt,
        "url=" + checkinResponse.url,
        "body=" + safeJson(checkinResponse.bodyText, 1200),
        commonDebug
      ])
    );
    return;
  }

  const duplicateFeedback = hasDuplicateFeedback(
    checkinResponse.json,
    checkinResponse.bodyText
  );
  const successFeedback = hasSuccessFeedback(
    checkinResponse.json,
    checkinResponse.bodyText
  );
  const websiteFeedback = feedbackTexts(
    checkinResponse.json,
    checkinResponse.bodyText
  ).join(" || ");

  const afterResponse = await request("GET", SHOP_PATH, token, "读取签到后积分");
  let after = null;
  let afterReadOk = false;
  let afterDetail = "";

  if (!afterResponse.transportOk) {
    afterDetail =
      "afterError=" + afterResponse.error +
      ",afterStatus=" + afterResponse.status +
      ",afterAttempt=" + afterResponse.attempt;
  } else if (!(afterResponse.status >= 200 && afterResponse.status < 300)) {
    afterDetail =
      "afterStatus=" + afterResponse.status +
      ",afterBody=" + safeJson(afterResponse.bodyText, 800);
  } else {
    after = extractBalance(afterResponse.json);
    afterReadOk = after != null;
    if (!afterReadOk) {
      afterDetail = "无法解析签到后积分,afterBody=" + safeJson(afterResponse.bodyText, 800);
    }
  }

  // 状态二：必须同时满足网站反馈“今日已签到”且积分没有变化。
  if (duplicateFeedback && afterReadOk && after === before) {
    finish("已重复签到！获得0AC币，当前总AC币" + after);
    return;
  }

  // 状态一：必须同时满足网站真实成功反馈且积分确实增加。
  if (successFeedback && afterReadOk && after > before) {
    const reward = extractReward(
      checkinResponse.json,
      checkinResponse.bodyText,
      after - before
    );
    finish("签到成功！获得" + reward + "AC币，当前总AC币" + after);
    return;
  }

  // 其余全部归为失败，并给出完整诊断。
  finish(
    failure([
      "阶段=签到结果校验",
      "签到前积分=" + before,
      "签到后积分=" + (afterReadOk ? after : "未知"),
      "积分差值=" + (afterReadOk ? after - before : "未知"),
      "checkinStatus=" + checkinResponse.status,
      "checkinError=" + checkinResponse.error,
      "checkinBody=" + safeJson(checkinResponse.bodyText, 1500),
      "网站反馈=" + safeJson(websiteFeedback, 1000),
      "duplicateFeedback=" + duplicateFeedback,
      "successFeedback=" + successFeedback,
      afterDetail,
      commonDebug
    ])
  );
}

main().catch(function (error) {
  finish(
    failure([
      "阶段=未捕获异常",
      "version=" + VERSION,
      "error=" + String(error && error.message ? error.message : error),
      "stack=" + safeJson(error && error.stack ? error.stack : "", 1500)
    ])
  );
});

