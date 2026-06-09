import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  InputNumber,
  Button,
  Space,
  Statistic,
  Row,
  Col,
  Table,
  Tag,
  Popconfirm,
  message,
} from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import Decimal from "decimal.js";
import { getSetting, execute, select, fmtMoney, fmtDecimal } from "../lib/db";

interface FlowRecord {
  id: number;
  record_date: string;
  source: string;
  gross_amount: string;
  platform_fee: string;
  net_amount: string;
  type: string;
  created_at: string;
}

const PersonalCalc: React.FC = () => {
  const [price, setPrice] = useState<number | null>(30);
  const [hours, setHours] = useState<number | null>(1);
  const [result, setResult] = useState<{ total: string; net: string } | null>(null);
  const [flowList, setFlowList] = useState<FlowRecord[]>([]);

  const loadFlow = useCallback(async () => {
    const rows = await select<FlowRecord>(
      "SELECT * FROM income_records WHERE type = 'personal' ORDER BY id DESC LIMIT 20"
    );
    setFlowList(rows);
  }, []);

  useEffect(() => {
    (async () => {
      const up = await getSetting("personal_unit_price");
      if (up) setPrice(Number(up));
      loadFlow();
    })();
  }, [loadFlow]);

  // ── 计算 ──
  const calc = async () => {
    if (!price || price <= 0) { message.warning("请输入有效单价"); return; }
    if (!hours || hours <= 0) { message.warning("请输入有效时长"); return; }
    const p = new Decimal(price);
    const h = new Decimal(hours);
    const total = p.mul(h);
    setResult({ total: fmtMoney(total), net: fmtMoney(total) });

    const today = new Date().toISOString().slice(0, 10);
    const source = `个人接单（¥${price}/h × ${hours}h）`;
    try {
      await execute(
        "INSERT INTO income_records (source, gross_amount, platform_fee, net_amount, type, record_date) VALUES (?, ?, ?, ?, ?, ?)",
        [source, total.toString(), "0", total.toString(), "personal", today]
      );
      message.success("已记录");
      await loadFlow();
    } catch (err) {
      console.error("个人接单写入失败:", err);
      message.error("写入失败，请重启应用后重试");
    }
  };

  // ── 删除 ──
  const deleteFlow = async (id: number) => {
    await execute("DELETE FROM income_records WHERE id = ?", [id]);
    message.success("已删除");
    await loadFlow();
  };

  const flowColumns = [
    { title: "日期", dataIndex: "record_date", key: "date", width: 90 },
    { title: "渠道", dataIndex: "source", key: "source", width: 180, ellipsis: true },
    {
      title: "类型", dataIndex: "type", key: "type", width: 70,
      render: () => <Tag color="cyan">个人</Tag>,
    },
    {
      title: "总金额", dataIndex: "gross_amount", key: "gross", width: 120,
      render: (v: string) => "¥" + fmtMoney(new Decimal(v)),
    },
    {
      title: "抽成", dataIndex: "platform_fee", key: "fee", width: 80,
      render: (v: string) => new Decimal(v).eq(0)
        ? <span style={{ color: "#999" }}>¥0</span>
        : <span style={{ color: "#f5222d" }}>-¥{fmtMoney(new Decimal(v))}</span>,
    },
    {
      title: "到手", dataIndex: "net_amount", key: "net", width: 120,
      render: (v: string) => <span style={{ color: "#52c41a" }}>¥{fmtMoney(new Decimal(v))}</span>,
    },
    {
      title: "操作", key: "action", width: 60,
      render: (_: unknown, record: FlowRecord) => (
        <Popconfirm title="确定删除？" onConfirm={() => deleteFlow(record.id)}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: "16px 16px 80px", maxWidth: 960, margin: "0 auto" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <span>
                陪玩计价{" "}
                <Tag color="cyan">个人接单 · 无抽成</Tag>
              </span>
            }
          >
            <div style={{ marginBottom: 12, color: "#888", fontSize: 13 }}>
              个人接单，现打现结算，全额入账 · 个人渠道
            </div>
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <div>
                <div style={{ marginBottom: 6, color: "#555" }}>单价（元/小时）</div>
                <InputNumber style={{ width: "100%" }} size="large" min={0} prefix="¥"
                  value={price} onChange={(v) => setPrice(v)} />
              </div>
              <div>
                <div style={{ marginBottom: 6, color: "#555" }}>时长（小时）</div>
                <InputNumber style={{ width: "100%" }} size="large" min={0}
                  value={hours} onChange={(v) => setHours(v)} />
              </div>
              <Button type="primary" size="large" block onClick={calc}>计算并记录</Button>
            </Space>
            {result && (
              <div style={{ marginTop: 16, padding: 16, background: "#f6ffed", borderRadius: 8, border: "1px solid #b7eb8f" }}>
                <Row gutter={16}>
                  <Col span={12}><Statistic title="总金额" value={"¥" + result.total} /></Col>
                  <Col span={12}><Statistic title="抽成" value="¥0" valueStyle={{ color: "#999" }} /></Col>
                  <Col span={24} style={{ marginTop: 12 }}>
                    <Statistic title="实际到手（全额）" value={"¥" + result.net} valueStyle={{ color: "#52c41a", fontSize: 28 }} />
                  </Col>
                </Row>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── 流水记录 ── */}
      <Card title="个人接单流水" size="small" style={{ marginTop: 16 }}>
        <Table columns={flowColumns} dataSource={flowList} rowKey="id"
          size="small" pagination={false} scroll={{ x: 720 }}
          locale={{ emptyText: "暂无记录" }} />
      </Card>
    </div>
  );
};

export default PersonalCalc;
