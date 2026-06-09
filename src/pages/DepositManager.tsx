import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Input,
  InputNumber,
  Button,
  Select,
  Modal,
  Row,
  Col,
  Statistic,
  Tag,
  Space,
  message,
  Popconfirm,
  Alert,
  Tooltip,
} from "antd";
import { PlusOutlined, DollarOutlined, UserOutlined, DeleteOutlined } from "@ant-design/icons";
import Decimal from "decimal.js";
import { execute, select, getSetting, fmtMoney, fmtDecimal } from "../lib/db";

interface Customer {
  id: number;
  name: string;
  remark: string;
}

interface DepositSummary {
  customer_id: number;
  customer_name: string;
  remaining_actual: Decimal;
  remaining_gift: Decimal;
  remaining_amount: Decimal;
  hasBalance: boolean;
}

const DepositManager: React.FC = () => {
  // ── 老板建档 ──
  const [newName, setNewName] = useState("");
  const [newRemark, setNewRemark] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);

  // ── 存单录入 ──
  const [selCustomerId, setSelCustomerId] = useState<number | undefined>(undefined);
  const [depositUnitPrice, setDepositUnitPrice] = useState<number | null>(30);
  const [depositAmount, setDepositAmount] = useState<number | null>(null);

  // ── 存单满赠规则 ──
  const [giftRule, setGiftRule] = useState<{ threshold: string; gift: string }>({
    threshold: "10",
    gift: "1",
  });

  // ── 总览 ──
  const [totalAmount, setTotalAmount] = useState("0");
  const [totalActual, setTotalActual] = useState("0");
  const [totalGift, setTotalGift] = useState("0");

  // ── 老板列表 ──
  const [deposits, setDeposits] = useState<DepositSummary[]>([]);

  // ── 消费 Modal ──
  const [consumeVisible, setConsumeVisible] = useState(false);
  const [consumeCustomer, setConsumeCustomer] = useState<DepositSummary | null>(null);
  const [consumeHours, setConsumeHours] = useState<number | null>(null);
  const shortfall = (() => {
    if (!consumeCustomer || !consumeHours) return null;
    const used = new Decimal(consumeHours).toDecimalPlaces(5);
    const total = consumeCustomer.remaining_gift.add(consumeCustomer.remaining_actual);
    if (used.lte(total)) return null;
    const diffH = used.sub(total);
    const diffM = diffH.mul(consumeCustomer.remaining_amount.div(
      consumeCustomer.remaining_actual.gt(0) ? consumeCustomer.remaining_actual : new Decimal(1)
    ));
    return { hours: fmtDecimal(diffH), amount: fmtMoney(diffM) };
  })();

  const loadCustomers = useCallback(async () => {
    const rows = await select<Customer>("SELECT id, name, remark FROM customers ORDER BY id DESC");
    setCustomers(rows);
  }, []);

  const loadDeposits = useCallback(async () => {
    // 查询所有老板含余额（含零余额）
    const rows = await select<{
      customer_id: number;
      customer_name: string;
      sum_actual: string | null;
      sum_gift: string | null;
      avg_price: string | null;
    }>(
      `SELECT c.id as customer_id, c.name as customer_name,
              COALESCE(SUM(CAST(d.remaining_actual_hours AS REAL)), 0) as sum_actual,
              COALESCE(SUM(CAST(d.remaining_gift_hours AS REAL)), 0) as sum_gift,
              COALESCE(AVG(CAST(d.unit_price AS REAL)), 0) as avg_price
       FROM customers c
       LEFT JOIN deposits d ON d.customer_id = c.id
       GROUP BY c.id, c.name
       ORDER BY c.name`
    );
    const list: DepositSummary[] = rows.map((r) => {
      const sa = new Decimal(r.sum_actual || "0");
      const sg = new Decimal(r.sum_gift || "0");
      const ap = new Decimal(r.avg_price || "0");
      return {
        customer_id: r.customer_id,
        customer_name: r.customer_name,
        remaining_actual: sa,
        remaining_gift: sg,
        remaining_amount: sa.mul(ap),
        hasBalance: sa.add(sg).gt(new Decimal("0.0000000001")),
      };
    });
    setDeposits(list);

    // 总览：总存单金额 = 所有老板未消费金额（剩余实际金额）
    const stats = await select<{ total_remaining: string }>(
      `SELECT COALESCE(SUM(CAST(remaining_actual_hours AS REAL) * CAST(unit_price AS REAL)), 0) as total_remaining
       FROM deposits`
    );
    if (stats.length > 0) {
      setTotalAmount(fmtMoney(new Decimal(stats[0].total_remaining)));
    }
    const remainStats = await select<{ sum_actual: string; sum_gift: string }>(
      `SELECT COALESCE(SUM(CAST(remaining_actual_hours AS REAL)),0) as sum_actual,
              COALESCE(SUM(CAST(remaining_gift_hours AS REAL)),0) as sum_gift FROM deposits`
    );
    if (remainStats.length > 0) {
      setTotalActual(fmtDecimal(new Decimal(remainStats[0].sum_actual)));
      setTotalGift(fmtDecimal(new Decimal(remainStats[0].sum_gift)));
    }
  }, []);

  useEffect(() => {
    loadCustomers();
    loadDeposits();
    (async () => {
      const gr = await getSetting("deposit_gift_rule");
      if (gr) { try { setGiftRule(JSON.parse(gr)); } catch { /* */ } }
      const up = await getSetting("deposit_unit_price");
      if (up) setDepositUnitPrice(Number(up));
    })();
  }, [loadCustomers, loadDeposits]);

  // ── 添加老板 ──
  const addCustomer = async () => {
    if (!newName.trim()) { message.warning("请输入昵称"); return; }
    await execute("INSERT INTO customers (name, remark) VALUES (?, ?)", [newName.trim(), newRemark.trim()]);
    message.success("老板已添加");
    setNewName("");
    setNewRemark("");
    loadCustomers();
  };

  // ── 存单录入 ──
  const addDeposit = async () => {
    if (!selCustomerId) { message.warning("请选择老板"); return; }
    if (!depositUnitPrice || depositUnitPrice <= 0) { message.warning("请输入有效单价"); return; }
    if (!depositAmount || depositAmount <= 0) { message.warning("请输入存入金额"); return; }
    const price = new Decimal(depositUnitPrice).toDecimalPlaces(5);
    const amount = new Decimal(depositAmount).toDecimalPlaces(5);
    const actualHours = amount.div(price);
    const threshold = new Decimal(giftRule.threshold);
    const giftPer = new Decimal(giftRule.gift);
    const giftTimes = actualHours.div(threshold).floor();
    const giftHours = giftTimes.mul(giftPer);
    const giftAmount = price.mul(giftHours);

    await execute(
      `INSERT INTO deposits (customer_id, unit_price, deposit_amount, actual_hours, gift_hours, actual_amount, gift_amount, remaining_actual_hours, remaining_gift_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [selCustomerId, price.toString(), amount.toString(), actualHours.toString(), giftHours.toString(),
       amount.toString(), giftAmount.toString(), actualHours.toString(), giftHours.toString()]
    );
    message.success("存单已录入");
    setDepositAmount(null);
    loadDeposits();
  };

  // ── 删除老板（仅删 customer，保留消费流水） ──
  const deleteCustomer = async (id: number) => {
    await execute("DELETE FROM deposits WHERE customer_id = ?", [id]);
    await execute("DELETE FROM customers WHERE id = ?", [id]);
    message.success("已删除");
    loadCustomers();
    loadDeposits();
  };

  // ── 消费 ──
  const openConsume = (d: DepositSummary) => {
    setConsumeCustomer(d);
    setConsumeHours(null);
    setConsumeVisible(true);
  };

  const confirmConsume = async () => {
    if (!consumeCustomer || !consumeHours || consumeHours <= 0) { message.warning("请输入有效时长"); return; }
    // 用 toDecimalPlaces(5) 消除 JS number 的浮点误差
    let used = new Decimal(consumeHours).toDecimalPlaces(5);
    const remainingGift = consumeCustomer.remaining_gift;
    const remainingActual = consumeCustomer.remaining_actual;
    const totalAvail = remainingGift.add(remainingActual);

    // 超过余额：自动填满 + 提示差额
    if (used.gt(totalAvail)) {
      const diffH = used.sub(totalAvail);
      const diffM = diffH.mul(consumeCustomer.remaining_amount.div(
        consumeCustomer.remaining_actual.gt(0) ? consumeCustomer.remaining_actual : new Decimal(1)
      ));
      message.warning(`超出 ${fmtDecimal(diffH)}h，差额 ¥${fmtMoney(diffM)}，已自动填满`);
      used = totalAvail;
      setConsumeHours(Number(used.toString()));
    }

    const giftAvail = Decimal.min(remainingGift, used);
    const remainingUsed = used.sub(giftAvail);
    const actualAvail = remainingUsed.gt(0) ? Decimal.min(remainingActual, remainingUsed) : new Decimal(0);

    // 逐条扣减
    const rows = await select<{
      id: number;
      remaining_actual_hours: string;
      remaining_gift_hours: string;
      unit_price: string;
    }>(
      `SELECT id, remaining_actual_hours, remaining_gift_hours, unit_price
       FROM deposits WHERE customer_id = ?
       AND (CAST(remaining_actual_hours AS REAL) > 0 OR CAST(remaining_gift_hours AS REAL) > 0)
       ORDER BY created_at ASC`,
      [consumeCustomer.customer_id]
    );

    let giftToDeduct = used;
    let actualDed = new Decimal(0);
    let giftDed = new Decimal(0);
    let totalIncomeActual = new Decimal(0); // 实际扣除金额 = Σ(actual_deducted × unit_price)

    for (const row of rows) {
      if (giftToDeduct.lte(0)) break;
      const rg = new Decimal(row.remaining_gift_hours);
      const ra = new Decimal(row.remaining_actual_hours);
      const up = new Decimal(row.unit_price);

      const gDed = Decimal.min(rg, giftToDeduct);
      giftToDeduct = giftToDeduct.sub(gDed);
      let aDed = new Decimal(0);
      if (giftToDeduct.gt(0)) {
        aDed = Decimal.min(ra, giftToDeduct);
        giftToDeduct = giftToDeduct.sub(aDed);
      }
      const newRg = rg.sub(gDed).toDecimalPlaces(5);
      const newRa = ra.sub(aDed).toDecimalPlaces(5);
      giftDed = giftDed.add(gDed);
      actualDed = actualDed.add(aDed);
      totalIncomeActual = totalIncomeActual.add(aDed.mul(up));

      await execute(
        "UPDATE deposits SET remaining_gift_hours = ?, remaining_actual_hours = ? WHERE id = ?",
        [newRg.toString(), newRa.toString(), row.id]
      );
    }

    // 插入消费记录
    await execute(
      "INSERT INTO consumptions (customer_id, hours_used, actual_deducted, gift_deducted) VALUES (?, ?, ?, ?)",
      [consumeCustomer.customer_id, used.toString(), actualDed.toString(), giftDed.toString()]
    );

    // 消费计入收入（存单渠道，无抽成，纯利润）
    if (totalIncomeActual.gt(0)) {
      const today = new Date().toISOString().slice(0, 10);
      const income = totalIncomeActual;
      // 计算有效单价（多存单混合扣减时取加权均价）
      const effPrice = actualDed.gt(0) ? income.div(actualDed) : new Decimal(0);
      const source = `存单消费 - ${consumeCustomer.customer_name}（¥${fmtMoney(effPrice)}/h × ${fmtDecimal(actualDed)}h）`;
      await execute(
        "INSERT INTO income_records (source, gross_amount, platform_fee, net_amount, type, record_date) VALUES (?, ?, ?, ?, ?, ?)",
        [source, income.toString(), "0", income.toString(), "deposit", today]
      );
    }

    message.success("消费已记录，收入已计入");
    setConsumeVisible(false);
    loadDeposits();
  };

  return (
    <div style={{ padding: "16px 16px 80px", maxWidth: 960, margin: "0 auto" }}>
      {/* ── 总览统计 ── */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="总存单金额" value={"¥" + totalAmount} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="总剩余实际时长" value={totalActual + "h"} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="总剩余赠送时长" value={totalGift + "h"} valueStyle={{ fontSize: 20, color: "#faad14" }} />
          </Card>
        </Col>
      </Row>

      {/* ── 老板建档 + 存单录入 ── */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="老板建档" size="small">
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              <Space.Compact style={{ width: "100%" }}>
                <Input placeholder="输入昵称" value={newName} onChange={(e) => setNewName(e.target.value)}
                  onPressEnter={addCustomer} prefix={<UserOutlined />} />
                <Button type="primary" icon={<PlusOutlined />} onClick={addCustomer}>添加</Button>
              </Space.Compact>
              <Input placeholder="备注（选填）" value={newRemark} onChange={(e) => setNewRemark(e.target.value)}
                onPressEnter={addCustomer} allowClear size="small" />
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={<span>存单录入 <Tag color="green" style={{ fontSize: 10 }}>无抽成·纯利润</Tag></span>} size="small">
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              <Select style={{ width: "100%" }} placeholder="选择老板" value={selCustomerId}
                onChange={setSelCustomerId}
                options={customers.map((c) => ({
                  label: c.remark ? `${c.name}（${c.remark}）` : c.name,
                  value: c.id,
                }))} />
              <InputNumber style={{ width: "100%" }} size="middle" min={0} prefix="¥"
                placeholder="单价（默认30/h）" value={depositUnitPrice} onChange={(v) => setDepositUnitPrice(v)} />
              <InputNumber style={{ width: "100%" }} size="middle" min={0} prefix="¥"
                placeholder="存入金额" value={depositAmount} onChange={(v) => setDepositAmount(v)} />
              <Button type="primary" block onClick={addDeposit}>录入存单</Button>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* ── 老板列表 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {deposits.map((d) => (
          <Card key={d.customer_id} size="small"
            title={
              <span><UserOutlined style={{ marginRight: 6 }} />
                {customers.find((c) => c.id === d.customer_id)?.remark ? (
                  <Tooltip title={customers.find((c) => c.id === d.customer_id)!.remark}>
                    {d.customer_name}
                  </Tooltip>
                ) : (
                  d.customer_name
                )}
              </span>
            }
            extra={
              d.hasBalance ? (
                <Button type="primary" size="small" icon={<DollarOutlined />} onClick={() => openConsume(d)}>消费</Button>
              ) : (
                <Space size={4}>
                  <Tag color="default" style={{ fontSize: 11 }}>无余额</Tag>
                  <Popconfirm title="确定删除？不影响流水记录" onConfirm={() => deleteCustomer(d.customer_id)}>
                    <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              )
            }>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>实际剩余：<strong>{fmtDecimal(d.remaining_actual)}h</strong></div>
              <div>赠送剩余：<Tag color="orange">{fmtDecimal(d.remaining_gift)}h</Tag></div>
              <div>剩余金额：<strong style={{ color: "#eb2f96" }}>¥{fmtMoney(d.remaining_amount)}</strong></div>
            </div>
          </Card>
        ))}
        {deposits.length === 0 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#999", padding: 32 }}>暂无存单记录</div>
        )}
      </div>

      {/* ── 消费 Modal ── */}
      <Modal title={"消费 - " + (consumeCustomer?.customer_name || "")}
        open={consumeVisible} onCancel={() => setConsumeVisible(false)}
        onOk={confirmConsume} okText="确认消费" cancelText="取消">
        <div style={{ marginBottom: 12 }}>
          <Tag color="orange">赠送剩余：{consumeCustomer ? fmtDecimal(consumeCustomer.remaining_gift) : "0"}h</Tag>
          <Tag>实际剩余：{consumeCustomer ? fmtDecimal(consumeCustomer.remaining_actual) : "0"}h</Tag>
        </div>
        <div style={{ marginBottom: 6, color: "#555" }}>本次使用时长（小时）</div>
        <InputNumber style={{ width: "100%" }} size="large" min={0} value={consumeHours} onChange={(v) => setConsumeHours(v)} />
        {shortfall && (
          <Alert
            style={{ marginTop: 10 }}
            type="warning"
            showIcon
            message={`超出 ${shortfall.hours}h，差额 ¥${shortfall.amount}，确认后将按最大可用时长扣除`}
          />
        )}
        <div style={{ marginTop: shortfall ? 4 : 8, fontSize: 12, color: "#888" }}>
          优先扣赠送时长，赠送不足再扣实际时长，计入收入（无抽成）
        </div>
      </Modal>
    </div>
  );
};

export default DepositManager;
