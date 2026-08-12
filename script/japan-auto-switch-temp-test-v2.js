// Loon 日本策略临时定时切换测试 v2
// 05:15：使用 【自建-ALL日本-HY2】
// 05:20：使用 【自建-ALL日本-VLESS】
// 已针对 Loon 3.5.0(975) 实测：使用 $config.setSelectPolicy() 切换策略。

const PARENT = "【自建-ALL日本】";
const VLESS = "【自建-ALL日本-VLESS】";
const HY2 = "【自建-ALL日本-HY2】";

const now = new Date();
const hour = now.getHours();
const minute = now.getMinutes();
const target = (hour === 5 && minute >= 15 && minute < 20) ? HY2 : VLESS;
const before = $config.getSelectedPolicy(PARENT);

if (before === target) {
  console.log(`[临时测试] 无需切换，当前已经是：${target}`);
  $done();
} else if (typeof $config.setSelectPolicy !== "function") {
  console.log(`[临时测试] 切换失败：当前 Loon 不提供 $config.setSelectPolicy()`);
  $notification.post("Loon 临时测试", "切换失败", "当前版本不提供 setSelectPolicy 接口");
  $done();
} else {
  const result = $config.setSelectPolicy(PARENT, target);
  const after = $config.getSelectedPolicy(PARENT);
  const verified = after === target;

  if (verified) {
    console.log(`[临时测试] 已真实切换成功：${before} -> ${after}；API返回=${result}`);
    $notification.post("Loon 临时测试", "切换成功", `${before} → ${after}`);
  } else {
    console.log(`[临时测试] 切换失败：请求目标=${target}；切换前=${before}；切换后=${after}；API返回=${result}`);
    $notification.post("Loon 临时测试", "切换失败", `目标：${target}\n实际仍为：${after}`);
  }

  $done();
}
