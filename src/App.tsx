import React, { useEffect, useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { ConfigProvider, App as AntApp, Spin } from "antd";
import zhCN from "antd/locale/zh_CN";
import { themeConfig } from "./lib/theme";
import { initDatabase } from "./lib/init-db";
import Navigation from "./components/Navigation";
import PlatformCalc from "./pages/PlatformCalc";
import PersonalCalc from "./pages/PersonalCalc";
import DepositManager from "./pages/DepositManager";
import IncomeStats from "./pages/IncomeStats";
import Settings from "./pages/Settings";

const App: React.FC = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await initDatabase();
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  return (
    <ConfigProvider theme={themeConfig} locale={zhCN}>
      <AntApp>
        <HashRouter>
          <div style={{ paddingBottom: 56 }}>
            <Routes>
              <Route path="/" element={<PlatformCalc />} />
              <Route path="/personal" element={<PersonalCalc />} />
              <Route path="/deposit" element={<DepositManager />} />
              <Route path="/income" element={<IncomeStats />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
          <Navigation />
        </HashRouter>
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
