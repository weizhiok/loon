// Loon 日本策略定时切换 v2
// 20:00 ～ 次日 01:59：使用 【自建-ALL日本-HY2】
// 02:00 ～ 19:59：使用 【自建-ALL日本-VLESS】
// 已针对 Loon 3.5.0(975) 实测：使用 $config.setSelectPolicy() 切换策略。

const PARENT = "【自建-ALL日本】";
const VLESS = "【自建-ALL日本-VLESS】";
const HY2 = "【自建-ALL日本-HY2】";

const hour = new Date().getHours();
const target = (hour >= 20 || hour < 2) ? HY2 : VLESS;
const before = $config.getSelectedPolicy(PARENT);

if (before === target) {
  console.log(`[日本策略定时切换] 无需切换，当前已经是：${target}`);
  $done();
} else if (typeof $config.setSelectPolicy !== "function") {
  console.log(`[日本策略定时切换] 切换失败：当前 Loon 不提供 $config.setSelectPolicy()`);
  $notification.post(
    "Loon 日本策略定时切换",
    "切换失败",
    "当前版本不提供 setSelectPolicy 接口"
  );
  $done();
} else {
  const result = $config.setSelectPolicy(PARENT, target);
  const after = $config.getSelectedPolicy(PARENT);
  const verified = after === target;

  if (verified) {
    console.log(`[日本策略定时切换] 已真实切换成功：${before} -> ${after}；API返回=${result}`);
    $notification.post(
      "Loon 日本策略定时切换",
      "切换成功",
      `${before} → ${after}`
    );
  } else {
    console.log(`[日本策略定时切换] 切换失败：请求目标=${target}；切换前=${before}；切换后=${after}；API返回=${result}`);
    $notification.post(
      "Loon 日本策略定时切换",
      "切换失败",
      `目标：${target}\n实际仍为：${after}`
    );
  }

  $done();
}
