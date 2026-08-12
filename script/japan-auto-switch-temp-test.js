// Loon 日本策略临时定时切换测试
// 05:15：使用 【自建-ALL日本-HY2】
// 05:20：使用 【自建-ALL日本-VLESS】
// 时间以 iPhone / iPad 当前系统时区为准。

const PARENT = "【自建-ALL日本】";
const VLESS = "【自建-ALL日本-VLESS】";
const HY2 = "【自建-ALL日本-HY2】";

const now = new Date();
const hour = now.getHours();
const minute = now.getMinutes();

// 05:15 任务固定切 HY2；05:20 任务固定切 VLESS。
// 给定时任务少量触发延迟余量：05:15～05:19 视为 HY2，其余视为 VLESS。
const target = (hour === 5 && minute >= 15 && minute < 20) ? HY2 : VLESS;
const current = $config.getSelectedPolicy(PARENT);

if (current === target) {
  console.log(`[临时测试] 无需切换，当前已经是：${target}`);
  $done();
} else {
  const success = $config.getConfig(PARENT, target);

  if (success) {
    console.log(`[临时测试] 切换成功：${current} -> ${target}`);
    $notification.post(
      "Loon 临时测试",
      "切换成功",
      `${current} → ${target}`
    );
  } else {
    console.log(`[临时测试] 切换失败：${current} -> ${target}`);
    $notification.post(
      "Loon 临时测试",
      "切换失败",
      `请检查策略组名称：${PARENT} / ${target}`
    );
  }

  $done();
}
