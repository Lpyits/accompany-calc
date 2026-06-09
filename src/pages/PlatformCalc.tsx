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
import { getSetting, execute, select, fmtMoney } from "../lib/db";
import { push } from "../lib/push";

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

const PlatformCalc: React.FC = () => {
  // ── 陪玩计价 state ──
  const [unitPrice, setUnitPrice] = useState<number | null>(40);
  const [hours, setHours] = useState<number | null>(1);
  const [commissionRate, setCommissionRate] = useState<string>("0.125");
  const [platformResult, setPlatformResult] = useState<{
    total: string;
    fee: string;
    net: string;
  } | null>(null);

  // ── 红包计价 state ──
  const [redpacketAmount, setRedpacketAmount] = useState<number | null>(null);
  const [redpacketTiers, setRedpacketTiers] = useState<
    { min?: number; max?: number; rate: number }[]
  >([]);
  const [redpacketResult, setRedpacketResult] = useState<{
    amount: string;
    rateLabel: string;
    fee: string;
    net: string;
  } | null>(null);

  // ── 流水记录 ──
  const [flowList, setFlowList] = useState<FlowRecord[]>([]);

  // ── 加载配置 & 流水 ──
  const loadFlow = useCallback(async () => {
    const rows = await select<FlowRecord>(
      "SELECT * FROM income_records WHERE type IN ('platform','redpacket') ORDER BY id DESC LIMIT 20"
    );
    setFlowList(rows);
  }, []);

  useEffect(() => {
    (async () => {
      const cr = await getSetting("platform_commission");
      if (cr) setCommissionRate(cr);
      const up = await getSetting("default_unit_price");
      if (up) setUnitPrice(Number(up));
      const rt = await getSetting("redpacket_tiers");
      if (rt) {
        try { setRedpacketTiers(JSON.parse(rt)); } catch { /* ignore */ }
      }
      loadFlow();
    })();
  }, []); // 每次进入页面重新读取配置，确保与配置中心联动

  const getRedpacketRate = useCallback(
    async (amount: Decimal): Promise<Decimal> => {
      // 每次计算前实时从 DB 读取，确保与配置中心强联动
      const rt = await getSetting("redpacket_tiers");
      const tiers: { min?: number; max?: number; rate: number }[] = rt ? JSON.parse(rt) : redpacketTiers;
      for (const tier of tiers) {
        const min = tier.min != null ? new Decimal(tier.min) : new Decimal(0);
        const max = tier.max != null ? new Decimal(tier.max) : new Decimal(Infinity);
        const lowerOk = tier.min != null ? amount.gt(min) : amount.gte(min);
        if (lowerOk && amount.lte(max)) return new Decimal(tier.rate);
      }
      if (tiers.length > 0) return new Decimal(tiers[tiers.length - 1].rate);
      return new Decimal(0);
    },
    [redpacketTiers]
  );

  // ── 陪玩计价计算 ──
  const calcPlatform = async () => {
    if (!unitPrice || unitPrice <= 0) { message.warning("请输入有效单价"); return; }
    if (!hours || hours <= 0) { message.warning("请输入有效时长"); return; }
    const price = new Decimal(unitPrice);
    const hrs = new Decimal(hours);
    const total = price.mul(hrs);
    const rate = new Decimal(commissionRate);
    const fee = total.mul(rate);
    const net = total.sub(fee);

    setPlatformResult({ total: fmtMoney(total), fee: fmtMoney(fee), net: fmtMoney(net) });

    const today = new Date().toISOString().slice(0, 10);
    const source = `平台单（¥${unitPrice}/h × ${hours}h）`;
    await execute(
      "INSERT INTO income_records (source, gross_amount, platform_fee, net_amount, type, record_date) VALUES (?, ?, ?, ?, ?, ?)",
      [source, total.toString(), fee.toString(), net.toString(), "platform", today]
    );
    message.success("已记录");
    await loadFlow();
    push("陪玩计价", `¥${unitPrice}/h × ${hours}h，总${fmtMoney(total)}，抽${fmtMoney(fee)}，到手${fmtMoney(net)}`);
  };

  // ── 红包计价计算 ──
  const calcRedpacket = async () => {
    if (!redpacketAmount || redpacketAmount <= 0) { message.warning("请输入有效红包金额"); return; }
    const amount = new Decimal(redpacketAmount);
    const rate = await getRedpacketRate(amount);
    const fee = amount.mul(rate);
    const net = amount.sub(fee);
    const ratePercent = rate.mul(100).toDecimalPlaces(0).toString();

    setRedpacketResult({
      amount: fmtMoney(amount),
      rateLabel: rate.eq(0) ? "免抽成" : ratePercent + "%",
      fee: fmtMoney(fee),
      net: fmtMoney(net),
    });

    const today = new Date().toISOString().slice(0, 10);
    await execute(
      "INSERT INTO income_records (source, gross_amount, platform_fee, net_amount, type, record_date) VALUES (?, ?, ?, ?, ?, ?)",
      ["平台单", amount.toString(), fee.toString(), net.toString(), "redpacket", today]
    );
    message.success("已记录");
    await loadFlow();
    push("红包计价", `¥${redpacketAmount}，抽${fmtMoney(fee)}，到手${fmtMoney(net)}`);
  };

  // ── 删除流水 ──
  const deleteFlow = async (id: number) => {
    const rows = await select<FlowRecord>("SELECT * FROM income_records WHERE id = ?", [id]);
    const info = rows.length > 0 ? `来源：${rows[0].source}，总¥${rows[0].gross_amount}，到手¥${rows[0].net_amount}` : `ID: ${id}`;
    await execute("DELETE FROM income_records WHERE id = ?", [id]);
    message.success("已删除");
    await loadFlow();
    push("删除数据", `平台计价：${info}`);
  };

  // ── 流水表格列 ──
  const flowColumns = [
    { title: "日期", dataIndex: "record_date", key: "date", width: 90 },
    { title: "渠道", dataIndex: "source", key: "source", width: 180, ellipsis: true },
    {
      title: "类型", dataIndex: "type", key: "type", width: 70,
      render: (t: string) => {
        const m: Record<string, { color: string; label: string }> = {
          platform: { color: "blue", label: "平台" },
          redpacket: { color: "pink", label: "红包" },
        };
        const r = m[t] || { color: "default", label: t };
        return <Tag color={r.color}>{r.label}</Tag>;
      },
    },
    {
      title: "总金额", dataIndex: "gross_amount", key: "gross", width: 120,
      render: (v: string) => "¥" + fmtMoney(new Decimal(v)),
    },
    {
      title: "抽成", dataIndex: "platform_fee", key: "fee", width: 120,
      render: (v: string) => <span style={{ color: "#f5222d" }}>-¥{fmtMoney(new Decimal(v))}</span>,
    },
    {
      title: "到手", dataIndex: "net_amount", key: "net", width: 120,
      render: (v: string) => <span style={{ color: "#52c41a" }}>¥{fmtMoney(new Decimal(v))}</span>,
    },
    {
      title: "操作", key: "action", width: 60,
      render: (_: unknown, record: FlowRecord) => (
        <Popconfirm title="确定删除？收入统计将同步更新" onConfirm={() => deleteFlow(record.id)}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: "16px 16px 80px", maxWidth: 960, margin: "0 auto" }}>
      <Row gutter={[16, 16]}>
        {/* ── 陪玩计价 ── */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <span>
                陪玩计价{" "}
                <Tag color="#eb2f96">抽成 {(Number(commissionRate) * 100).toFixed(1)}%</Tag>
              </span>
            }
          >
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <div>
                <div style={{ marginBottom: 6, color: "#555" }}>单价（元/小时）</div>
                <InputNumber style={{ width: "100%" }} size="large" min={0} prefix="¥" value={unitPrice} onChange={(v) => setUnitPrice(v)} />
              </div>
              <div>
                <div style={{ marginBottom: 6, color: "#555" }}>时长（小时）</div>
                <InputNumber style={{ width: "100%" }} size="large" min={0} value={hours} onChange={(v) => setHours(v)} />
              </div>
              <Button type="primary" size="large" block onClick={calcPlatform}>计算并记录</Button>
            </Space>
            {platformResult && (
              <div style={{ marginTop: 16, padding: 16, background: "#fafafa", borderRadius: 8 }}>
                <Row gutter={16}>
                  <Col span={12}><Statistic title="总金额" value={"¥" + platformResult.total} /></Col>
                  <Col span={12}><Statistic title="抽成总额" value={"-¥" + platformResult.fee} valueStyle={{ color: "#f5222d" }} /></Col>
                  <Col span={24} style={{ marginTop: 12 }}>
                    <Statistic title="实际到手" value={"¥" + platformResult.net} valueStyle={{ color: "#52c41a", fontSize: 28 }} />
                  </Col>
                </Row>
              </div>
            )}
          </Card>
        </Col>

        {/* ── 红包计价 ── */}
        <Col xs={24} lg={12}>
          <Card title="红包计价">
            <div style={{ marginBottom: 16, color: "#888", fontSize: 13 }}>
              阶梯抽成：{redpacketTiers.map((t, i) => {
                  const rateStr = t.rate === 0 ? "免抽" : `抽${(t.rate * 100).toFixed(0)}%`;
                  let text = "";
                  if (t.min == null) text = `0<x≤${t.max}元 ${rateStr}`;
                  else if (t.max == null) text = `x>${t.min}元 ${rateStr}`;
                  else text = `${t.min}<x≤${t.max}元 ${rateStr}`;
                  return <span key={i}>{i > 0 ? " | " : ""}{text}</span>;
                })}
            </div>
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <div>
                <div style={{ marginBottom: 6, color: "#555" }}>红包金额（元）</div>
                <InputNumber style={{ width: "100%" }} size="large" min={0} prefix="¥" value={redpacketAmount} onChange={(v) => setRedpacketAmount(v)} />
              </div>
              <Button type="primary" size="large" block onClick={calcRedpacket}>计算并记录</Button>
            </Space>
            {redpacketResult && (
              <div style={{ marginTop: 16, padding: 16, background: "#fafafa", borderRadius: 8 }}>
                <Row gutter={16}>
                  <Col span={12}><Statistic title="红包金额" value={"¥" + redpacketResult.amount} /></Col>
                  <Col span={12}><Statistic title="适用抽成" value={redpacketResult.rateLabel} valueStyle={{ color: "#f5222d" }} /></Col>
                  <Col span={12} style={{ marginTop: 12 }}><Statistic title="抽成金额" value={"-¥" + redpacketResult.fee} valueStyle={{ color: "#f5222d" }} /></Col>
                  <Col span={12} style={{ marginTop: 12 }}><Statistic title="实际到手" value={"¥" + redpacketResult.net} valueStyle={{ color: "#52c41a" }} /></Col>
                </Row>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── 平台流水 ── */}
      <Card title="平台流水记录" size="small" style={{ marginTop: 16 }}>
        <Table
          columns={flowColumns}
          dataSource={flowList}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: 700 }}
          locale={{ emptyText: "暂无记录" }}
        />
      </Card>
    </div>
  );
};

export default PlatformCalc;
