import type { ThemeConfig } from "antd";

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: "#eb2f96",
    colorSuccess: "#52c41a",
    colorWarning: "#faad14",
    colorError: "#f5222d",
    borderRadius: 8,
    colorBgBase: "#ffffff",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBorder: "#d9d9d9",
  },
  components: {
    Button: {
      colorPrimary: "#eb2f96",
      algorithm: true,
    },
    Card: {
      borderRadiusLG: 12,
    },
  },
};
