// Loon 策略切换诊断脚本
// 用于定位 $config 策略切换 API 在当前 Loon 版本中的真实行为。

const PARENT = "【自建-ALL日本】";
const VLESS = "【自建-ALL日本-VLESS】";
const HY2 = "【自建-ALL日本-HY2】";

const hour = new Date().getHours();
const TARGET = (hour >= 20 || hour < 2) ? HY2 : VLESS;

function safeJson(v) {
  try { return JSON.stringify(v); } catch (_) { return String(v); }
}

function readState(label) {
  let selected = null;
  let configSelected = null;
  let allGroups = [];
  let raw = null;

  try {
    selected = $config.getSelectedPolicy(PARENT);
  } catch (e) {
    console.log(`[诊断] ${label} getSelectedPolicy异常: ${e}`);
  }

  try {
    raw = $config.getConfig();
    const conf = JSON.parse(raw);
    allGroups = conf.all_policy_groups || [];
    configSelected = conf.policy_select ? conf.policy_select[PARENT] : undefined;
  } catch (e) {
    console.log(`[诊断] ${label} getConfig()解析异常: ${e}`);
  }

  console.log(`[诊断] ${label} getSelectedPolicy = ${safeJson(selected)}`);
  console.log(`[诊断] ${label} policy_select[PARENT] = ${safeJson(configSelected)}`);
  console.log(`[诊断] 与“自建-ALL日本”匹配的实际策略组 = ${safeJson(allGroups.filter(x => String(x).includes("自建-ALL日本")))}`);

  return { selected, configSelected };
}

function isTarget(state) {
  return state.selected === TARGET || state.configSelected === TARGET;
}

console.log("========== Loon 策略切换诊断开始 ==========");
console.log(`[诊断] $loon = ${safeJson($loon)}`);
console.log(`[诊断] PARENT = ${safeJson(PARENT)}`);
console.log(`[诊断] TARGET = ${safeJson(TARGET)}`);
console.log(`[诊断] typeof $config.getConfig = ${typeof $config.getConfig}`);
console.log(`[诊断] typeof $config.getSelectedPolicy = ${typeof $config.getSelectedPolicy}`);
console.log(`[诊断] typeof $config.getSubPolicies = ${typeof $config.getSubPolicies}`);
console.log(`[诊断] typeof $config.getSubPolicys = ${typeof $config.getSubPolicys}`);
console.log(`[诊断] typeof $config.setSelectPolicy = ${typeof $config.setSelectPolicy}`);

try {
  if (typeof $config.getSubPolicies === "function") {
    $config.getSubPolicies(PARENT, (subs) => {
      console.log(`[诊断] getSubPolicies(${safeJson(PARENT)}) = ${safeJson(subs)}`);
    });
  } else if (typeof $config.getSubPolicys === "function") {
    const subs = $config.getSubPolicys(PARENT);
    console.log(`[诊断] getSubPolicys(${safeJson(PARENT)}) = ${safeJson(subs)}`);
  }
} catch (e) {
  console.log(`[诊断] 读取子策略异常: ${e}`);
}

const before = readState("切换前");

if (isTarget(before)) {
  console.log("[诊断] 当前已经是目标策略。为了诊断 API，不再重复切换。");
  console.log("========== Loon 策略切换诊断结束 ==========");
  $done();
} else {
  let oldApiTried = false;

  if (typeof $config.setSelectPolicy === "function") {
    oldApiTried = true;
    try {
      const retOld = $config.setSelectPolicy(PARENT, TARGET);
      console.log(`[诊断] setSelectPolicy 返回类型 = ${typeof retOld}`);
      console.log(`[诊断] setSelectPolicy 返回值 = ${safeJson(retOld)}`);
    } catch (e) {
      console.log(`[诊断] setSelectPolicy 调用异常: ${e}`);
    }

    const afterOld = readState("setSelectPolicy后");
    if (isTarget(afterOld)) {
      console.log("[诊断] ✅ 旧接口 setSelectPolicy 已真实切换成功");
      console.log("========== Loon 策略切换诊断结束 ==========");
      $done();
    }
  }

  if (!oldApiTried || !isTarget(readState("准备测试getConfig前"))) {
    try {
      const retNew = $config.getConfig(PARENT, TARGET);
      console.log(`[诊断] getConfig(PARENT,TARGET) 返回类型 = ${typeof retNew}`);
      if (typeof retNew === "string" && retNew.length > 300) {
        console.log(`[诊断] getConfig(PARENT,TARGET) 返回值前300字符 = ${retNew.slice(0, 300)}`);
      } else {
        console.log(`[诊断] getConfig(PARENT,TARGET) 返回值 = ${safeJson(retNew)}`);
      }
    } catch (e) {
      console.log(`[诊断] getConfig(PARENT,TARGET) 调用异常: ${e}`);
    }

    const afterNew = readState("getConfig切换后立即");

    setTimeout(() => {
      const delayed = readState("getConfig切换后1秒");
      if (isTarget(delayed)) {
        console.log("[诊断] ✅ 当前官方接口 getConfig(PARENT,TARGET) 已真实切换成功");
      } else {
        console.log("[诊断] ❌ 两种接口均未确认真实切换成功");
      }
      console.log("========== Loon 策略切换诊断结束 ==========");
      $done();
    }, 1000);
  }
}
