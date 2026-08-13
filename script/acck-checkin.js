// ACCK AC币每日签到
// API:
//   GET  https://sign-service.lucffee.com/api/auth/user/ac-shop
//   POST https://sign-service.lucffee.com/api/auth/user/ac-shop/checkin
// Header: Authorization: Bearer <auth_token>

const API_BASE = "https://sign-service.lucffee.com";
const SHOP_PATH = "/api/auth/user/ac-shop";
const CHECKIN_PATH = "/api/auth/user/ac-shop/checkin";
const TITLE = "ACCK AC币签到";

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
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    token = token.slice(1, -1).trim();
  }
  return token;
}

function notify(subtitle, body) {
  console.log("[" + TITLE + "] " + subtitle + " | " + body);
  try {
    $notification.post(TITLE, subtitle, body);
  } catch (e) {}
}

function done() {
  $done();
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
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

function requestJson(method, path, token) {
  return new Promise((resolve, reject) => {
    const url = API_BASE + path;
    const headers = {
      Authorization: "Bearer " + token,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    };
    const opts = {
      url: url,
      method: method,
      headers: headers,
      timeout: 20
    };
    if (method !== "GET" && method !== "HEAD") {
      opts.body = "{}";
    }

    $httpClient[method.toLowerCase()](opts, (error, response, data) => {
      if (error) {
        reject(new Error(String(error)));
        return;
      }
      const status = response && (response.status || response.statusCode);
      const bodyText = typeof data === "string" ? data : JSON.stringify(data);
      const json = parseJsonSafe(data);
      resolve({ status: status, bodyText: bodyText, json: json });
    });
  });
}

async function main() {
  const args = getArgs();
  const token = normalizeToken(args.token);

  if (!token) {
    notify("失败", "未填写 Token。请在插件参数中粘贴浏览器 auth_token。");
    done();
    return;
  }

  let before = null;
  try {
    const shop = await requestJson("GET", SHOP_PATH, token);
    if (shop.status === 401 || shop.status === 403) {
      notify("Token 失效", "请重新登录网站，抓取最新 auth_token 后更新插件参数。");
      done();
      return;
    }
    if (shop.status < 200 || shop.status >= 300) {
      notify("失败", "读取积分失败，HTTP " + shop.status + "：" + shop.bodyText);
      done();
      return;
    }
    before = extractBalance(shop.json);
    if (before == null) {
      notify("失败", "无法解析签到前积分：" + shop.bodyText);
      done();
      return;
    }
  } catch (e) {
    notify("失败", "读取积分异常：" + (e.message || e));
    done();
    return;
  }

  let checkinMessage = "";
  try {
    const checkin = await requestJson("POST", CHECKIN_PATH, token);
    if (checkin.status === 401 || checkin.status === 403) {
      notify("Token 失效", "签到时鉴权失败，请更新 Token。");
      done();
      return;
    }

    if (checkin.status === 400) {
      const msg =
        (checkin.json && (checkin.json.message || checkin.json.msg || checkin.json.error)) ||
        checkin.bodyText ||
        "今天可能已经签到过了";
      notify("已签到", "当前总积分 " + before + "。" + msg);
      done();
      return;
    }

    if (checkin.status < 200 || checkin.status >= 300) {
      notify("失败", "签到请求失败，HTTP " + checkin.status + "：" + checkin.bodyText);
      done();
      return;
    }

    checkinMessage =
      (checkin.json && (checkin.json.message || checkin.json.msg)) || "";
  } catch (e) {
    notify("失败", "签到请求异常：" + (e.message || e));
    done();
    return;
  }

  let after = null;
  try {
    const shop2 = await requestJson("GET", SHOP_PATH, token);
    if (shop2.status < 200 || shop2.status >= 300) {
      notify("部分成功", "签到已提交，但复读积分失败，HTTP " + shop2.status + "。签到前积分 " + before + "。" + checkinMessage);
      done();
      return;
    }
    after = extractBalance(shop2.json);
  } catch (e) {
    notify("部分成功", "签到已提交，但复读积分异常：" + (e.message || e) + "。签到前积分 " + before + "。" + checkinMessage);
    done();
    return;
  }

  if (after == null) {
    notify("部分成功", "签到已提交，但无法解析签到后积分。签到前积分 " + before + "。" + checkinMessage);
    done();
    return;
  }

  const delta = after - before;
  if (delta > 0) {
    notify("签到成功", "签到成功，获得" + delta + "积分，当前总积分" + after);
  } else if (checkinMessage) {
    notify("结果", checkinMessage + "；签到前 " + before + "，签到后 " + after);
  } else {
    notify("未获得积分", "签到后积分未增加。签到前 " + before + "，签到后 " + after + "。可能今天已签到。");
  }
  done();
}

main().catch(function (e) {
  notify("异常", String(e && e.message ? e.message : e));
  done();
});
