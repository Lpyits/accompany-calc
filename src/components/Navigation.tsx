import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Tabs } from "antd";
import {
  CalculatorOutlined,
  WalletOutlined,
  BarChartOutlined,
  SettingOutlined,
  UserOutlined,
} from "@ant-design/icons";

const tabs = [
  { key: "/", icon: <CalculatorOutlined />, label: "平台计价" },
  { key: "/personal", icon: <UserOutlined />, label: "个人接单" },
  { key: "/deposit", icon: <WalletOutlined />, label: "存单管理" },
  { key: "/income", icon: <BarChartOutlined />, label: "收入统计" },
  { key: "/settings", icon: <SettingOutlined />, label: "配置中心" },
];

const Navigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const activeKey = location.pathname === "/" ? "/" : "/" + location.pathname.split("/")[1];

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "#fff",
        borderTop: "1px solid #f0f0f0",
        zIndex: 1000,
        padding: "4px 0",
        boxShadow: "0 -2px 8px rgba(0,0,0,0.06)",
      }}
    >
      <Tabs
        activeKey={activeKey}
        onChange={(key) => navigate(key)}
        centered
        size="small"
        style={{ marginBottom: 0 }}
        tabBarStyle={{ marginBottom: 0 }}
        items={tabs.map((t) => ({
          key: t.key,
          label: (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 27, height: 21, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {React.cloneElement(t.icon, { style: { fontSize: 19 } })}
              </div>
              <span style={{ fontSize: 13, lineHeight: "17px" }}>{t.label}</span>
            </div>
          ),
        }))}
      />
    </div>
  );
};

export default Navigation;
