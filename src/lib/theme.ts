import type { ThemeConfig } from "antd";

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: "#eb2f96",
    colorSuccess: "#52c41a",
    colorWarning: "#faad14",
    colorError: "#f5222d",
    borderRadius: 8,
    colorBgContainer: "#ffffff",
  },
  components: {
    Button: {
      colorPrimary: "#eb2f96",
      algorithm: true,
    },
    Layout: {
      bodyBg: "#f5f5f5",
    },
    Card: {
      borderRadiusLG: 12,
    },
  },
};
