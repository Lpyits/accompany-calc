import React, { useState, useEffect } from "react";
import {
  Card,
  Table,
  Row,
  Col,
  Statistic,
  Select,
  Tag,
  Form,
  Input,
  DatePicker,
  Button,
  message,
  Popconfirm,
} from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import Decimal from "decimal.js";
import dayjs from "dayjs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { select, execute, fmtMoney } from "../lib/db";
import { push } from "../lib/push";

// ── 类型映射 ──
const typeLabel: Record<string, string> = {
  platform: "平台",
  deposit: "存单",
  redpacket: "红包",
  personal: "个人",
};
const typeColor: Record<string, string> = {
  platform: "blue",
  deposit: "green",
  redpacket: "pink",
  personal: "cyan",
};
// 渠道归属：platform + redpacket = 平台渠道，deposit + personal = 个人渠道
const channelLabel: Record<string, string> = {
  platform: "平台渠道",
  redpacket: "平台渠道",
  deposit: "个人渠道",
  personal: "个人渠道",
};
const channelColor: Record<string, string> = {
  platform: "purple",
  redpacket: "purple",
  deposit: "cyan",
  personal: "geekblue",
};

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

const IncomeStats: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState(dayjs().format("YYYY-MM"));
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  const [todayCount, setTodayCount] = useState(0);
  const [todayNet, setTodayNet] = useState("0");
  const [todayFee, setTodayFee] = useState("0");

  const [records, setRecords] = useState<FlowRecord[]>([]);

  const [selectedYear, setSelectedYear] = useState(dayjs().year());
  const [monthlyData, setMonthlyData] = useState<
    { month: string; count: number; total: number; avg: number }[]
  >([]);

  const [totalAllTime, setTotalAllTime] = useState("0");

  const [form] = Form.useForm();

  /** 加载有数据记录的所有月份 */
  const loadAvailableMonths = async () => {
    const rows = await select<{ month: string }>(
      "SELECT DISTINCT strftime('%Y-%m', record_date) as month FROM income_records ORDER BY month DESC"
    );
    setAvailableMonths(rows.map((r) => r.month));
  };

  const loadMonthOverview = async () => {
    const rows = await select<{ cnt: number; net: string; fee: string }>(
      "SELECT COUNT(*) as cnt, COALESCE(SUM(CAST(net_amount AS REAL)),0) as net, COALESCE(SUM(CAST(platform_fee AS REAL)),0) as fee FROM income_records WHERE strftime('%Y-%m', record_date) = ?",
      [selectedMonth]
    );
    if (rows.length > 0) {
      setTodayCount(Number(rows[0].cnt));
      setTodayNet(fmtMoney(new Decimal(rows[0].net)));
      setTodayFee(fmtMoney(new Decimal(rows[0].fee)));
    }
  };

  const loadTotalAllTime = async () => {
    const rows = await select<{ total: string }>(
      "SELECT COALESCE(SUM(CAST(net_amount AS REAL)),0) as total FROM income_records"
    );
    if (rows.length > 0) {
      setTotalAllTime(fmtMoney(new Decimal(rows[0].total)));
    }
  };

  const loadRecords = async () => {
    const rows = await select<FlowRecord>(
      "SELECT * FROM income_records WHERE strftime('%Y-%m', record_date) = ? ORDER BY id DESC",
      [selectedMonth]
    );
    setRecords(rows);
  };

  const loadMonthly = async (year: number) => {
    const rows = await select<{ month: string; cnt: number; total_net: string }>(
      `SELECT strftime('%Y-%m', record_date) as month,
              COUNT(*) as cnt,
              COALESCE(SUM(CAST(net_amount AS REAL)),0) as total_net
       FROM income_records WHERE strftime('%Y', record_date) = ?
       GROUP BY strftime('%Y-%m', record_date) ORDER BY month`,
      [String(year)]
    );
    setMonthlyData(
      rows.map((r) => {
        const cnt = Number(r.cnt);
        const total = Number(r.total_net);
        return {
          month: r.month,
          count: cnt,
          total: Math.round(total * 100) / 100,
          avg: cnt > 0 ? Math.round((total / cnt) * 100) / 100 : 0,
        };
      })
    );
  };

  useEffect(() => {
    loadAvailableMonths();
    loadMonthOverview();
    loadRecords();
    loadMonthly(selectedYear);
    loadTotalAllTime();
  }, [selectedYear, selectedMonth]);

  const deleteRecord = async (id: number) => {
    const rows = await select<FlowRecord>("SELECT * FROM income_records WHERE id = ?", [id]);
    const info = rows.length > 0 ? `来源：${rows[0].source}，总¥${rows[0].gross_amount}，到手¥${rows[0].net_amount}` : `ID: ${id}`;
    await execute("DELETE FROM income_records WHERE id = ?", [id]);
    message.success("已删除");
    loadMonthOverview();
    loadRecords();
    loadMonthly(selectedYear);
    loadTotalAllTime();
    push("删除数据", `收入统计：${info}`);
  };

  const addManualRecord = async (values: Record<string, unknown>) => {
    const date = values.date ? dayjs(values.date as string).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
    const source = (values.source as string) || "手动补录";
    const gross = new Decimal(values.gross_amount as string);

    await execute(
      "INSERT INTO income_records (source, gross_amount, platform_fee, net_amount, type, record_date) VALUES (?, ?, ?, ?, ?, ?)",
      [source, gross.toString(), "0", gross.toString(), "deposit", date]
    );
    message.success("已补录");
    form.resetFields();
    loadMonthOverview();
    loadRecords();
    loadMonthly(selectedYear);
    loadTotalAllTime();
    push("手动补录", `渠道：${source}，金额¥${fmtMoney(gross)}`);
  };

  const columns = [
    { title: "日期", dataIndex: "record_date", key: "date", width: 90 },
    { title: "渠道", dataIndex: "source", key: "source", width: 140, ellipsis: true },
    {
      title: "类型", dataIndex: "type", key: "type", width: 70,
      render: (t: string) => <Tag color={typeColor[t] || "default"}>{typeLabel[t] || t}</Tag>,
    },
    {
      title: "归属", key: "channel", width: 80,
      render: (_: unknown, r: FlowRecord) => (
        <Tag color={channelColor[r.type] || "default"}>{channelLabel[r.type] || "-"}</Tag>
      ),
    },
    {
      title: "总金额", dataIndex: "gross_amount", key: "gross", width: 100,
      render: (v: string) => "¥" + fmtMoney(new Decimal(v)),
    },
    {
      title: "抽成", dataIndex: "platform_fee", key: "fee", width: 100,
      render: (v: string) => {
        const d = new Decimal(v);
        return d.eq(0) ? <span style={{ color: "#999" }}>¥0</span> : <span style={{ color: "#f5222d" }}>-¥{fmtMoney(d)}</span>;
      },
    },
    {
      title: "到手", dataIndex: "net_amount", key: "net", width: 100,
      render: (v: string) => <span style={{ color: "#52c41a" }}>¥{fmtMoney(new Decimal(v))}</span>,
    },
    {
      title: "操作", key: "action", width: 60,
      render: (_: unknown, record: FlowRecord) => (
        <Popconfirm title="确定删除？" onConfirm={() => deleteRecord(record.id)}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const monthlyColumns = [
    { title: "月份", dataIndex: "month", key: "month" },
    { title: "接单数", dataIndex: "count", key: "count" },
    { title: "总收入", dataIndex: "total", key: "total", render: (v: number) => "¥" + v },
    { title: "平均单笔", dataIndex: "avg", key: "avg", render: (v: number) => "¥" + v },
  ];

  return (
    <div style={{ padding: "16px 16px 80px", maxWidth: 960, margin: "0 auto" }}>
      {/* ── 月份选择 + 当月概览 ── */}
      <Row gutter={16} style={{ marginBottom: 12 }} align="middle">
        <Col flex="auto">
          <Select
            value={selectedMonth}
            onChange={setSelectedMonth}
            style={{ width: 160 }}
            options={availableMonths.map((m) => ({ label: m, value: m }))}
            placeholder="选择月份"
          />
        </Col>
      </Row>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small"><Statistic title="当月接单数" value={todayCount} suffix="单" /></Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="当月总收入" value={"¥" + todayNet} valueStyle={{ color: "#52c41a" }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="当月平台抽成" value={"¥" + todayFee} valueStyle={{ color: "#f5222d" }} />
          </Card>
        </Col>
      </Row>

      {/* ── 收入流水 ── */}
      <Card title={`收入流水（${selectedMonth}）`} size="small" style={{ marginBottom: 16 }}>
        <Table columns={columns} dataSource={records} rowKey="id" size="small"
          pagination={false} scroll={{ x: 740 }} />
      </Card>

      {/* ── 月度统计 ── */}
      <Card title="月度统计" size="small" style={{ marginBottom: 16 }}
        extra={
          <Select value={selectedYear} onChange={setSelectedYear} style={{ width: 100 }}
            options={Array.from({ length: 5 }, (_, i) => ({
              label: String(dayjs().year() - i), value: dayjs().year() - i,
            }))} />
        }>
        {monthlyData.length > 0 && (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(val: number) => "¥" + val} />
              <Bar dataKey="total" fill="#eb2f96" name="总收入" maxBarSize={60} />
            </BarChart>
          </ResponsiveContainer>
        )}
        <Table columns={monthlyColumns} dataSource={monthlyData} rowKey="month"
          size="small" pagination={false} style={{ marginTop: 12 }} />
      </Card>

      {/* ── 累计总收入 ── */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card size="small">
            <Statistic
              title="累计总收入（自系统使用起）"
              value={"¥" + totalAllTime}
              valueStyle={{ color: "#52c41a", fontSize: 24 }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── 手动补录 ── */}
      <Card title="手动补录" size="small">
        <Form form={form} layout="inline" onFinish={addManualRecord}>
          <Form.Item name="date" label="日期"><DatePicker /></Form.Item>
          <Form.Item name="source" label="渠道"><Input placeholder="例如：微信" /></Form.Item>
          <Form.Item name="gross_amount" label="金额" rules={[{ required: true, message: "请输入金额" }]}>
            <Input prefix="¥" placeholder="0" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">补录</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default IncomeStats;
