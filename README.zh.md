# dsh-qq-history-search

按需启用的只读检索服务，用于 `dsh-qq-archive` 第 1 版格式的聊天归档。插件仍在开发，暂不适合生产使用或公开发布；目前没有向模型注册工具、没有 QQ 消息处理器或自动记忆功能。

调用方必须是受信任的 Host 代码：`requester` 和 `scope` 必须绑定到经过认证的实际消息，不能让模型自行指定。普通成员只能搜索已配置会话内自己的文字；只有明确配置的管理员可以搜索其他成员或全部成员，每位管理员都绑定到具体的租户、网络、机器人账号和用户 ID。同一进程中的插件及本机管理员视为可信，本库不能防御恶意 Host 或文件系统管理员。

各配置列表取交集，而不是账号与群的配对列表；默认不开放任何会话。搜索对文字片段使用区分大小写的 Unicode 子串匹配，不识别别名、不搜索图片，也不能据空结果断言全部历史中没有该内容。每页限制扫描条数、扫描字节、结果数、结果字节、并发和超时。`partial: true` 表示部分过大的记录或结果被跳过；`next` 表示当前有界扫描之后还有记录。分页游标加密，并绑定会话、请求者、发送者过滤和查询词，服务重启后失效。

SQLite 使用 `readOnly` 和 `query_only`，具体平台的 SQLite 仍可能需要 WAL 共享内存辅助文件。结果不包含附件引用或媒体文件。文件权限与保留期限由部署者管理；归档本身不加密。本插件不删除、迁移或修改现有记录。需要 Node ^22.19 或 >=24、DSH 0.2.2-rc.1、`dsh-im-kit` 0.2.0 及兼容的归档插件。

所有者可在 DSH 插件页面配置范围、管理员绑定和资源上限。修改时需要查询空闲，更新期间会阻止新查询并重启服务；现有分页游标将失效。先在 profile 中安装匹配版本的 `dsh-im-kit`，再通过 `dsh plugin --profile <profile> add <插件包>` 添加本插件。默认关闭，需明确配置后启用。

例如，下面的 profile 补丁选择一个示例群并绑定一位管理员。使用时请替换全部示例 ID，使其与经过认证的传输身份一致；不需要跨成员查询时可省略 `operators`。

```yaml
- id: qq-history-search
  config:
    enabled: true
    tenants: [example-tenant]
    networks: [onebot11]
    accounts: [example-account]
    groups: [example-group]
    operators:
      - tenant: example-tenant
        network: onebot11
        account: example-account
        user: example-admin
```

`npm test` 使用虚构数据。经过身份认证的下游适配器、真实 QQ、Linux 兼容性和发布尚未验证。`dsh-im-kit` 正式发布前需要使用本地构建包。
