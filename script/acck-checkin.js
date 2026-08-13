// ACCK AC币每日签到
// 三种结果严格分流：
// 1) 签到成功：网站真实反馈成功，且签到后积分 > 签到前积分
// 2) 已重复签到：网站真实反馈包含“今日已签到”，且积分无变化
// 3) 签到失败：其余所有情况，输出尽量完整的诊断日志

const API_BASE = "https://sign-service.lucffee.com";
const SHOP_PATH = "/api/auth/user/ac-shop";
const CHECKIN_PATH = "/api/auth/user/ac-shop/checkin";
const TITLE = "ACCK AC币签到";
const REQUEST_TIMEOUT = 30;
const MAX_RETRY = 2;
const RETRY_DELAY_MS = 800;

function getArgs() {
  if (typeof $argument === "object" && $argument) return $argument;
  if (typeof $argument === "string" && $argument.trim()) {
    try {
      return JSON.parse($argument);
    } catch (e) {
      return { token: $argument.trim() };
    }
  }
  return {};
}

function normalizeToken(raw) {
  if (raw == null) return "";
  let token = String(raw).trim();
  if (!token) return "";
  if (/^Bearer\s+/i.test(token)) {
    token = token.replace(/^Bearer\s+/i, "").trim();
  }
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  return token;
}

function notify(body) {
  console.log("[" + TITLE + "] " + body);
  try {
    $notification.post(TITLE, "", body);
  } catch (e) {}
}

function done() {
  $done();
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function parseJsonSafe(text) {
  if (text == null) return null;
  if (typeof text === "object") return text;
  try {
    return JSON.parse(String(text));
  } catch (e) {
    return null;
  }
}

function safeStringify(value, maxLen) {
  let text = "";
  try {
    if (typeof value === "string") text = value;
    else text = JSON.stringify(value);
  } catch (e) {
    text = String(value);
  }
  if (!text) return "";
  if (maxLen && text.length > maxLen) {
    return text.slice(0, maxLen) + "...(truncated,len=" + text.length + ")";
  }
  return text;
}

function extractBalance(data) {
  if (!data || typeof data !== "object") return null;
  const candidates = [
    data.balance,
    data.ac_balance,
    data.acBalance,
    data.points,
    data.coin,
    data.data && data.data.balance
  ];
  for (let i = 0; i < candidates.length; i++) {
    const v = candidates[i];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

function collectFeedbackTexts(json, bodyText) {
  const texts = [];
  if (typeof bodyText === "string" && bodyText.trim()) texts.push(bodyText.trim());
  if (json && typeof json === "object") {
    const keys = ["error", "message", "msg", "detail", "reason", "title", "status"];
    for (let i = 0; i < keys.length; i++) {
      const v = json[keys[i]];
      if (v != null && String(v).trim()) texts.push(String(v).trim());
    }
    if (json.data && typeof json.data === "object") {
      for (let i = 0; i < keys.length; i++) {
        const v = json.data[keys[i]];
        if (v != null && String(v).trim()) texts.push(String(v).trim());
      }
    }
  }
  return texts;
}

function hasTodayAlreadyCheckedInFeedback(json, bodyText) {
  const texts = collectFeedbackTexts(json, bodyText);
  for (let i = 0; i < texts.length; i++) {
    if (texts[i].indexOf("今日已签到") !== -1) return true;
  }
  return false;
}

function extractSuccessGain(json, bodyText, delta) {
  const texts = collectFeedbackTexts(json, bodyText);
  for (let i = 0; i < texts.length; i++) {
    const m = texts[i].match(/获得\s*(\d+)\s*(?:AC币|积分|AC)?/i);
    if (m) return Number(m[1]);
  }
  return delta;
}

function isSuccessFeedback(json, bodyText) {
  const texts = collectFeedbackTexts(json, bodyText);
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    if (t.indexOf("签到成功") !== -1) return true;
    if (/获得\s*\d+\s*(?:AC币|积分|AC)/i.test(t) && t.indexOf("今日已签到") === -1) {
      return true;
    }
  }
  if (json && typeof json === "object") {
    if (typeof json.balance === "number" && !json.error && !json.message && !json.msg) {
      return true;
    }
  }
  return false;
}

function isTimeoutError(errText) {
  const t = String(errText || "").toLowerCase();
  return (
    t.indexOf("timeout") !== -1 ||
    t.indexOf("timed out") !== -1 ||
    t.indexOf("reuqest timeout") !== -1 ||
    t.indexOf("request timeout") !== -1
  );
}

function buildHeaders(token) {
  return {
    Authorization: "Bearer " + token,
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    Origin: "https://acck.io",
    Referer: "https://acck.io/console/ac-store",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9"
  };
}

function requestOnce(method, path, token) {
  return new Promise(function (resolve) {
    const url = API_BASE + path;
    const opts = {
      url: url,
      method: method,
      headers: buildHeaders(token),
      timeout: REQUEST_TIMEOUT
    };
    if (method !== "GET" && method !== "HEAD") {
      opts.body = "{}";
    }

    const clientMethod = method.toLowerCase();
    if (!$httpClient || typeof $httpClient[clientMethod] !== "function") {
      resolve({
        ok: false,
        stage: "request",
        method: method,
        url: url,
        error: "当前 Loon 环境不支持 $httpClient." + clientMethod,
        status: null,
        bodyText: "",
        json: null,
        responseHeaders: null
      });
      return;
    }

    $httpClient[clientMethod](opts, function (error, response, data) {
      const status = response && (response.status || response.statusCode);
      const headers = response && (response.headers || response.header || null);
      const bodyText =
        typeof data === "string"
          ? data
          : data == null
            ? ""
            : safeStringify(data, 4000);
      const json = parseJsonSafe(data);

      if (error) {
        resolve({
          ok: false,
          stage: "request",
          method: method,
          url: url,
          error: String(error),
          status: status == null ? null : Number(status),
          bodyText: bodyText,
          json: json,
          responseHeaders: headers || null
        });
        return;
      }

      resolve({
        ok: true,
        stage: "request",
        method: method,
        url: url,
        error: null,
        status: status == null ? null : Number(status),
        bodyText: bodyText,
        json: json,
        responseHeaders: headers || null
      });
    });
  });
}

async function requestWithRetry(method, path, token, label) {
  let last = null;
  for (let attempt = 1; attempt <= MAX_RETRY + 1; attempt++) {
    last = await requestOnce(method, path, token);
    last.attempt = attempt;
    last.label = label;

    if (last.ok) return last;

    const canRetry =
      isTimeoutError(last.error) ||
      last.status === 429 ||
      last.status === 502 ||
      last.status === 503 ||
      last.status === 504;
    if (!canRetry || attempt > MAX_RETRY) return last;
    await sleep(RETRY_DELAY_MS * attempt);
  }
  return last;
}

function failDetail(parts) {
  const lines = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] != null && String(parts[i]).trim() !== "") {
      lines.push(String(parts[i]));
    }
  }
  return "签到失败！失败详情：" + lines.join(" | ");
}

async function main() {
  const args = getArgs();
  const token = normalizeToken(args.token);
  const debug = {
    apiBase: API_BASE,
    shopPath: SHOP_PATH,
    checkinPath: CHECKIN_PATH,
    requestTimeout: REQUEST_TIMEOUT,
    maxRetry: MAX_RETRY
  };

  if (!token) {
    notify(
      failDetail([
        "未填写 Token",
        "请在插件参数 Token 中粘贴浏览器 localStorage.auth_token",
        "debug=" + safeStringify(debug, 1000)
      ])
    );
    done();
    return;
  }

  const beforeResp = await requestWithRetry("GET", SHOP_PATH, token, "读取签到前积分");
  if (!beforeResp.ok) {
    notify(
      failDetail([
        "阶段=读取签到前积分失败",
        "error=" + beforeResp.error,
        "status=" + beforeResp.status,
        "attempt=" + beforeResp.attempt,
        "url=" + beforeResp.url,
        "body=" + safeStringify(beforeResp.bodyText, 1200),
        "debug=" + safeStringify(debug, 800)
      ])
    );
    done();
    return;
  }

  if (beforeResp.status === 401 || beforeResp.status === 403) {
    notify(
      failDetail([
        "阶段=读取签到前积分鉴权失败",
        "status=" + beforeResp.status,
        "body=" + safeStringify(beforeResp.bodyText, 1200),
        "判断=Token 可能失效，请重新抓取 auth_token",
        "debug=" + safeStringify(debug, 800)
      ])
    );
    done();
    return;
  }

  if (!(beforeResp.status >= 200 && beforeResp.status < 300)) {
    notify(
      failDetail([
        "阶段=读取签到前积分HTTP非成功",
        "status=" + beforeResp.status,
        "body=" + safeStringify(beforeResp.bodyText, 1200),
        "json=" + safeStringify(beforeResp.json, 1200),
        "debug=" + safeStringify(debug, 800)
      ])
    );
    done();
    return;
  }

  const before = extractBalance(beforeResp.json);
  if (before == null) {
    notify(
      failDetail([
        "阶段=无法解析签到前积分",
        "status=" + beforeResp.status,
        "body=" + safeStringify(beforeResp.bodyText, 1500),
        "json=" + safeStringify(beforeResp.json, 1500),
        "debug=" + safeStringify(debug, 800)
      ])
    );
    done();
    return;
  }

  const checkinResp = await requestWithRetry("POST", CHECKIN_PATH, token, "执行签到");
  if (!checkinResp.ok) {
    notify(
      failDetail([
        "阶段=执行签到请求失败",
        "签到前积分=" + before,
        "error=" + checkinResp.error,
        "status=" + checkinResp.status,
        "attempt=" + checkinResp.attempt,
        "url=" + checkinResp.url,
        "body=" + safeStringify(checkinResp.bodyText, 1200),
        "debug=" + safeStringify(debug, 800)
      ])
    );
    done();
    return;
  }

  const websiteFeedbackTexts = collectFeedbackTexts(checkinResp.json, checkinResp.bodyText);
  const websiteFeedback = websiteFeedbackTexts.join(" || ");
  const isDuplicateFeedback = hasTodayAlreadyCheckedInFeedback(
    checkinResp.json,
    checkinResp.bodyText
  );
  const isSuccessLikeFeedback = isSuccessFeedback(checkinResp.json, checkinResp.bodyText);

  const afterResp = await requestWithRetry("GET", SHOP_PATH, token, "读取签到后积分");
  let after = null;
  let afterReadOk = false;
  let afterReadDetail = "";

  if (!afterResp.ok) {
    afterReadDetail =
      "读取签到后积分失败: error=" +
      afterResp.error +
      ", status=" +
      afterResp.status +
      ", body=" +
      safeStringify(afterResp.bodyText, 800);
  } else if (!(afterResp.status >= 200 && afterResp.status < 300)) {
    afterReadDetail =
      "读取签到后积分HTTP非成功: status=" +
      afterResp.status +
      ", body=" +
      safeStringify(afterResp.bodyText, 800);
  } else {
    after = extractBalance(afterResp.json);
    if (after == null) {
      afterReadDetail =
        "无法解析签到后积分: body=" + safeStringify(afterResp.bodyText, 800);
    } else {
      afterReadOk = true;
    }
  }

  if (isDuplicateFeedback) {
    if (afterReadOk && after === before) {
      notify("已重复签到！获得0AC币，当前总AC币" + after);
      done();
      return;
    }

    notify(
      failDetail([
        "阶段=网站反馈今日已签到，但积分复核未通过",
        "签到前积分=" + before,
        "签到后积分=" + (afterReadOk ? after : "未知"),
        "网站反馈=" + safeStringify(websiteFeedback, 800),
        "checkinStatus=" + checkinResp.status,
        "checkinBody=" + safeStringify(checkinResp.bodyText, 1200),
        afterReadDetail || "积分复核信息缺失",
        "debug=" + safeStringify(debug, 800)
      ])
    );
    done();
    return;
  }

  if (afterReadOk && after > before && isSuccessLikeFeedback) {
    const gain = extractSuccessGain(checkinResp.json, checkinResp.bodyText, after - before);
    notify("签到成功！获得" + gain + "AC币，当前总AC币" + after);
    done();
    return;
  }

  if (
    afterReadOk &&
    after > before &&
    checkinResp.status >= 200 &&
    checkinResp.status < 300 &&
    !isDuplicateFeedback
  ) {
    const hasErrorField =
      checkinResp.json &&
      (checkinResp.json.error || checkinResp.json.msg || checkinResp.json.message);
    if (!hasErrorField || isSuccessLikeFeedback) {
      const gain = extractSuccessGain(checkinResp.json, checkinResp.bodyText, after - before);
      notify("签到成功！获得" + gain + "AC币，当前总AC币" + after);
      done();
      return;
    }
  }

  notify(
    failDetail([
      "阶段=签到结果无法归类为成功或重复签到",
      "签到前积分=" + before,
      "签到后积分=" + (afterReadOk ? after : "未知"),
      "积分差值=" + (afterReadOk ? after - before : "未知"),
      "checkinStatus=" + checkinResp.status,
      "checkinBody=" + safeStringify(checkinResp.bodyText, 1500),
      "checkinJson=" + safeStringify(checkinResp.json, 1500),
      "网站反馈汇总=" + safeStringify(websiteFeedback, 1000),
      "isDuplicateFeedback=" + isDuplicateFeedback,
      "isSuccessLikeFeedback=" + isSuccessLikeFeedback,
      "beforeStatus=" + beforeResp.status,
      "afterStatus=" + (afterResp ? afterResp.status : "null"),
      afterReadDetail || "afterReadOk=" + afterReadOk,
      "debug=" + safeStringify(debug, 800)
    ])
  );
  done();
}

main().catch(function (e) {
  notify(
    failDetail([
      "阶段=脚本未捕获异常",
      "error=" + String(e && e.message ? e.message : e),
      "stack=" + safeStringify(e && e.stack ? e.stack : "", 1500)
    ])
  );
  done();
});
