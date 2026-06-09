import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Card,
  Form,
  InputNumber,
  Input,
  Button,
  Popconfirm,
  Divider,
  message,
  Typography,
  Switch,
} from "antd";
import { DownloadOutlined, UploadOutlined, DeleteOutlined, ToolOutlined } from "@ant-design/icons";
import { getSetting, setSetting, execute, select } from "../lib/db";

const { TextArea } = Input;
const { Title } = Typography;

const Settings: React.FC = () => {
  const [form] = Form.useForm();
  const loadingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSettings = async () => {
    loadingRef.current = true;
    const platformCommission = await getSetting("platform_commission");
    const defaultUnitPrice = await getSetting("default_unit_price");
    const depositUnitPrice = await getSetting("deposit_unit_price");
    const personalUnitPrice = await getSetting("personal_unit_price");
    const redpacketTiers = await getSetting("redpacket_tiers");
    const depositGiftRule = await getSetting("deposit_gift_rule");

    const tierObj = redpacketTiers ? JSON.parse(redpacketTiers) : [];
    const giftObj = depositGiftRule ? JSON.parse(depositGiftRule) : { threshold: "10", gift: "1" };

    const vals = {
      platform_commission: platformCommission ? Number(platformCommission) : 0.125,
      default_unit_price: defaultUnitPrice ? Number(defaultUnitPrice) : 40,
      deposit_unit_price: depositUnitPrice ? Number(depositUnitPrice) : 30,
      personal_unit_price: personalUnitPrice ? Number(personalUnitPrice) : 30,
      gift_threshold: Number(giftObj.threshold),
      gift_hours: Number(giftObj.gift),
      redpacket_tiers: JSON.stringify(tierObj, null, 2),
    };

    form.setFieldsValue(vals);
    loadingRef.current = false;
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // ── 自动保存（去抖 800ms） ──
  const autoSave = useCallback(async (vals: Record<string, unknown>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await setSetting("platform_commission", String(vals.platform_commission));
        await setSetting("default_unit_price", String(vals.default_unit_price));
        await setSetting("deposit_unit_price", String(vals.deposit_unit_price));
        await setSetting("personal_unit_price", String(vals.personal_unit_price));

        const giftRule = JSON.stringify({
          threshold: String(vals.gift_threshold),
          gift: String(vals.gift_hours),
        });
        await setSetting("deposit_gift_rule", giftRule);

        // 校验 JSON
        const tiers = JSON.parse(vals.redpacket_tiers as string);
        await setSetting("redpacket_tiers", JSON.stringify(tiers));

        message.success("配置已自动保存");
      } catch {
        message.error("红包阶梯 JSON 格式错误，请修正");
      }
    }, 800);
  }, []);

  const onValuesChange = (_changed: unknown, all: Record<string, unknown>) => {
    if (loadingRef.current) return;
    autoSave(all);
  };

  // ── 数据管理 ──
  const [devMode, setDevMode] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  /** 通过 SQL 安全清空业务数据，保留配置信息 */
  const clearAllData = async () => {
    await execute("DELETE FROM consumptions");
    await execute("DELETE FROM income_records");
    await execute("DELETE FROM deposits");
    await execute("DELETE FROM customers");
    message.success("业务数据已清空，配置信息保留");
    setTimeout(() => window.location.reload(), 500);
  };

  /** 导出所有表数据为 JSON 备份 */
  const exportBackup = async () => {
    const customers = await select("SELECT * FROM customers");
    const deposits = await select("SELECT * FROM deposits");
    const consumptions = await select("SELECT * FROM consumptions");
    const income = await select("SELECT * FROM income_records");
    const settings = await select("SELECT * FROM settings");
    const backup = { customers, deposits, consumptions, income_records: income, settings };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accompany-calc-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success("备份已导出");
  };

  /** 导入 JSON 备份恢复数据 */
  const importBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      // 先清空再导入
      await execute("DELETE FROM consumptions");
      await execute("DELETE FROM income_records");
      await execute("DELETE FROM deposits");
      await execute("DELETE FROM customers");
      await execute("DELETE FROM settings");
      // 逐表导入（保留原始 id 以维持关联关系）
      for (const row of backup.customers || []) {
        await execute("INSERT INTO customers (id, name, remark, created_at) VALUES (?, ?, ?, ?)", [row.id, row.name, row.remark || "", row.created_at || ""]);
      }
      for (const row of backup.deposits || []) {
        await execute("INSERT INTO deposits (id, customer_id, unit_price, deposit_amount, actual_hours, gift_hours, actual_amount, gift_amount, remaining_actual_hours, remaining_gift_hours, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [row.id, row.customer_id, row.unit_price, row.deposit_amount, row.actual_hours, row.gift_hours, row.actual_amount, row.gift_amount, row.remaining_actual_hours, row.remaining_gift_hours, row.created_at || ""]);
      }
      for (const row of backup.consumptions || []) {
        await execute("INSERT INTO consumptions (id, customer_id, hours_used, actual_deducted, gift_deducted, created_at) VALUES (?, ?, ?, ?, ?, ?)", [row.id, row.customer_id, row.hours_used, row.actual_deducted, row.gift_deducted, row.created_at || ""]);
      }
      for (const row of backup.income_records || []) {
        await execute("INSERT INTO income_records (id, source, gross_amount, platform_fee, net_amount, type, record_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [row.id, row.source, row.gross_amount, row.platform_fee, row.net_amount, row.type, row.record_date, row.created_at || ""]);
      }
      for (const row of backup.settings || []) {
        await execute("INSERT INTO settings (id, key, value, updated_at) VALUES (?, ?, ?, ?)", [row.id, row.key, row.value, row.updated_at || ""]);
      }
      message.success("数据已导入，请手动刷新页面");
      setTimeout(() => window.location.reload(), 500);
    } catch {
      message.error("导入失败：文件格式不正确");
    }
    // 重置 input 以便重复导入同一文件
    e.target.value = "";
  };

  // ── UI ──
  return (
    <div style={{ padding: "16px 16px 80px", maxWidth: 600, margin: "0 auto" }}>
      <Title level={4} style={{ marginBottom: 4 }}>配置中心</Title>
      <div style={{ color: "#888", fontSize: 12, marginBottom: 16 }}>
        修改即自动保存，其他页面即时同步
      </div>
      <Card>
        <Form form={form} layout="vertical" onValuesChange={onValuesChange}>
          <Form.Item name="platform_commission" label="平台抽成比例" tooltip="0.125 即 12.5%">
            <InputNumber style={{ width: "100%" }} min={0} max={1} step={0.001} stringMode />
          </Form.Item>

          <Form.Item name="default_unit_price" label="平台默认单价（元/小时）">
            <InputNumber style={{ width: "100%" }} min={0} prefix="¥" stringMode />
          </Form.Item>

          <Form.Item name="deposit_unit_price" label="存单默认单价（元/小时）">
            <InputNumber style={{ width: "100%" }} min={0} prefix="¥" stringMode />
          </Form.Item>

          <Form.Item name="personal_unit_price" label="个人接单默认单价（元/小时）">
            <InputNumber style={{ width: "100%" }} min={0} prefix="¥" stringMode />
          </Form.Item>

          <Form.Item name="gift_threshold" label="存单满赠阈值（小时）">
            <InputNumber style={{ width: "100%" }} min={0} stringMode />
          </Form.Item>

          <Form.Item name="gift_hours" label="存单满赠时长（小时）">
            <InputNumber style={{ width: "100%" }} min={0} stringMode />
          </Form.Item>

          <Form.Item name="redpacket_tiers" label="红包阶梯规则（JSON）">
            <TextArea rows={8} style={{ fontFamily: "monospace", fontSize: 13 }} />
          </Form.Item>
        </Form>
      </Card>

      {/* ── 数据管理（开发测试） ── */}
      <div style={{ marginTop: 16, textAlign: "right" }}>
        <span style={{ marginRight: 8, color: "#888", fontSize: 13 }}>开发者工具</span>
        <Switch size="small" checked={devMode} onChange={setDevMode} />
      </div>
      {devMode && (
        <Card title={<span><ToolOutlined /> 数据管理</span>} size="small" style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Button icon={<DownloadOutlined />} onClick={exportBackup}>导出数据备份</Button>
            <Button icon={<UploadOutlined />} onClick={() => importRef.current?.click()}>导入数据备份</Button>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              style={{ display: "none" }}
              onChange={importBackup}
            />
{/* 清空数据按钮已隐藏
            <Popconfirm
              title="确定清空所有数据？"
              description="将删除所有老板、存单、消费、收入记录，不可恢复！（配置信息保留）"
              onConfirm={clearAllData}
              okText="确定清空"
              cancelText="取消"
            >
              <Button danger icon={<DeleteOutlined />}>清空所有数据</Button>
            </Popconfirm>
*/}
          </div>
          <Divider style={{ margin: "12px 0" }} />
          <div style={{ color: "#888", fontSize: 12 }}>
            提示：清空数据通过 SQL 操作，不会损坏数据库文件。导入备份前建议先导出当前数据。
          </div>
        </Card>
      )}
    </div>
  );
};

export default Settings;
