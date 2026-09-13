import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "用户协议", description: "SHUAI GAY 社区用户协议。" };

export default function TermsPage() {
  return (
    <LegalPage title="用户协议" updated="2026 年 9 月 13 日">
      <section><h2>账号与使用资格</h2><p>请提供可用邮箱并妥善保管账号。你应对账号下的操作负责；发现异常设备时请立即在账号设置中下线并修改密码。不得批量注册、冒用他人身份或绕过访问限制。</p></section>
      <section><h2>社区行为</h2><p>不得发布违法、诈骗、骚扰、仇恨、人肉隐私、恶意广告、侵权或破坏站点安全的内容。不要因为性取向、性别表达或正常交友内容攻击他人。不同意观点可以讨论，不得针对个人持续骚扰。</p></section>
      <section><h2>你发布的内容</h2><p>内容权利仍归你或原权利人所有。为了展示、分发、备份和管理社区内容，你授予本站在服务范围内必要的非独占许可。请只上传你有权分享的内容，并对来源和授权负责。</p></section>
      <section><h2>审核与处置</h2><p>站点可根据社区规则对内容待审、隐藏、锁定、移动、删除或恢复，也可限制或封禁违规账号。举报会留痕并由管理员或对应版主处理；被举报私信仅在处理该举报时向管理员展示。</p></section>
      <section><h2>服务变化与责任</h2><p>我们会尽力保障服务可用和数据安全，但维护、故障及不可抗力可能造成中断。对重大功能或协议变化会尽量提前公告；继续使用即表示接受更新后的条款。</p></section>
      <section><h2>停止使用</h2><p>你可以随时导出数据并注销账号。注销会删除私人数据，公共讨论将匿名保留，以免破坏其他用户参与的对话结构。</p></section>
    </LegalPage>
  );
}
