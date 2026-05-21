// frontend/src/admin/layouts/AdminLayout.tsx
import { Layout, Menu, Button, Typography } from 'antd';
import {
  DashboardOutlined, BarChartOutlined, BankOutlined, LogoutOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const { Sider, Content } = Layout;
const { Text } = Typography;

const NAV_ITEMS = [
  { key: '/admin/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/admin/analytics', icon: <BarChartOutlined />,  label: 'Analytics' },
  { key: '/admin/clubs',     icon: <BankOutlined />,      label: 'Clubs' },
];

export default function AdminLayout() {
  const { user, logout } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey =
    NAV_ITEMS.slice(1).find(item => location.pathname.startsWith(item.key))?.key
    ?? '/admin/dashboard';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} style={{ background: '#141414', borderRight: '1px solid #1f1f1f', position: 'relative' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1f1f1f' }}>
          <Text style={{ color: '#444', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block' }}>
            SportStock
          </Text>
          <Text style={{ color: '#888', fontSize: 12 }}>Platform Admin</Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={NAV_ITEMS.map(({ key, icon, label }) => ({ key, icon, label }))}
          onClick={({ key }) => navigate(key)}
          style={{ background: '#141414', borderRight: 'none', marginTop: 4 }}
        />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 20px', borderTop: '1px solid #1f1f1f' }}>
          <Text style={{ color: '#555', fontSize: 11, display: 'block', marginBottom: 6 }}>{user?.email}</Text>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            size="small"
            style={{ color: '#555', padding: 0, height: 'auto', fontSize: 12 }}
            onClick={() => { logout(); navigate('/admin/login'); }}
          >
            Sign out
          </Button>
        </div>
      </Sider>
      <Layout style={{ background: '#0d0d0d' }}>
        <Content style={{ padding: 24, minHeight: '100vh' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
