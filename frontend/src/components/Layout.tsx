import { Layout, Menu, Button, Typography } from 'antd';
import {
  FileTextOutlined,
  FolderOutlined,
  FormOutlined,
  TeamOutlined,
  HistoryOutlined,
  LogoutOutlined,
  UserOutlined,
  DollarOutlined,
  BankOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { logout } from '../utils/auth';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/employees', icon: <UserOutlined />, label: '员工档案' },
  { key: '/companies', icon: <BankOutlined />, label: '公司管理' },
  { key: '/generate', icon: <FormOutlined />, label: '生成合同' },
  { key: '/batch', icon: <TeamOutlined />, label: '批量生成' },
  { key: '/history', icon: <HistoryOutlined />, label: '生成记录' },
  { key: '/templates', icon: <FileTextOutlined />, label: '模板管理' },
  { key: '/template-sets', icon: <FolderOutlined />, label: '模板集合' },
  { key: '/social-wages', icon: <DollarOutlined />, label: '社平工资' },
  { key: '/data-management', icon: <DatabaseOutlined />, label: '数据管理' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={200}>
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
            HR 合同系统
          </Typography.Title>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography.Text type="warning">空数据离线版 · 无原始档案 · 飞书同步已禁用 · 仅使用虚构资料</Typography.Text>
          <Button icon={<LogoutOutlined />} onClick={logout}>
            退出登录
          </Button>
        </Header>
        <Content style={{ margin: 24, padding: 24, background: '#fff', borderRadius: 8, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
