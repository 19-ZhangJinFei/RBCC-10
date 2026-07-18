# 来源与版权说明

## 项目来源

本仓库 `19-ZhangJinFei/RBCC-10` 基于开源项目 [Hunter0809/DouYun](https://github.com/Hunter0809/DouYun) 开展后续开发。

- 上游仓库：`https://github.com/Hunter0809/DouYun`
- 引入时的上游基线提交：`4cc8306743276b11ce61b9f9b8e13cdb31b6eca8`
- 基线标记分支：`upstream-history`
- 基线标记标签：`upstream-douyun-4cc8306`
- 上游历史并入当前仓库的合并提交：`df270f2`

仓库有意保留上游原始提交、作者、提交说明和时间，不对其进行删除、倒签或改写。这样可以清晰区分既有技术底座与 RBCC 期间新增的工作。

## RBCC 开发边界

- 2026-07-12：RBCC 挑战营开营。
- 2026-07-16：团队开始本次 RBCC 项目开发。
- 2026-07-18：建立本仓库、接入上游基线，完成代码结构审查与透明基线记录。

自透明基线建立后，RBCC 相关变更使用实际发生时间提交，并通过分支、commit 和 pull request 记录研发过程。各项变更、负责人和验证材料应以对应的提交、PR 与 [研发日志](docs/RBCC_DEVELOPMENT_LOG.md) 为准。

上游已有功能不应被表述为 RBCC 期间从零开发。本项目的准确口径是：团队从本次场景的问题定义和产品方案出发，在既有开源技术底座上进行面向 RBCC 目标的功能重构、技术迭代和用户验证。

## 许可证

本仓库根目录的 [LICENSE](LICENSE) 为 GNU Affero General Public License v3.0（AGPL-3.0），并要求保留原始版权声明。本仓库继续沿用该许可证；贡献者在使用、修改、部署或分发代码时应遵守其全部条款。

README 顶部保留的 `https://douyun-huazhang-3g29.vercel.app/` 是上游历史演示环境，不属于本 RBCC 仓库独立部署成果。后续如建立新的 RBCC 部署，应以单独记录的部署地址和对应提交为准。
