// Loon 双策略定时切换 v3
// 策略组名称和触发时间均由插件 [Argument] 自定义。
// 已针对 Loon 3.5.0(975) 实测：优先使用 $config.setSelectPolicy()，并在切换后读回验证。

const args = (typeof $argument === "object" && $argument) ? $argument : {};
const parent = args.parentPolicy;
const target = (typeof args.policyA === "string") ? args.policyA : args.policyB;
const targetLabel = (typeof args.policyA === "string") ? "A" : ((typeof args.policyB === "string") ? "B" : "未知");

function finish(title, message, notify = true) {
  console.log(`[策略定时切换 v3] ${message}`);
  if (notify) {
    $notification.post("Loon 策略定时切换", title, message);
  }
  $done();
}

if (typeof parent !== "string" || parent.length === 0) {
  finish("切换失败", "母策略组参数为空");
} else if (typeof target !== "string" || target.length === 0) {
  finish("切换失败", "目标子策略组参数为空");
} else {
  const before = $config.getSelectedPolicy(parent);

  if (before === target) {
    console.log(`[策略定时切换 v3] 无需切换：母策略组=${parent}；当前已经是子策略组${targetLabel}=${target}`);
    $done();
  } else {
    let method = "";
    let result = false;

    if (typeof $config.setSelectPolicy === "function") {
      method = "setSelectPolicy";
      result = $config.setSelectPolicy(parent, target);
    } else if (typeof $config.getConfig === "function") {
      // 兼容未来/其他版本 Loon；最终仍以 getSelectedPolicy() 读回结果为准。
      method = "getConfig(policyName, selectName)";
      result = $config.getConfig(parent, target);
    } else {
      finish("切换失败", "当前 Loon 没有可用的策略切换 API");
    }

    if (method) {
      const after = $config.getSelectedPolicy(parent);
      const verified = after === target;

      if (verified) {
        finish(
          "切换成功",
          `母策略组：${parent}\n${before} → ${after}\n目标：子策略组${targetLabel}\nAPI：${method}；返回=${result}`
        );
      } else {
        finish(
          "切换失败",
          `母策略组：${parent}\n目标：${target}\n切换前：${before}\n切换后：${after}\nAPI：${method}；返回=${result}`
        );
      }
    }
  }
}
