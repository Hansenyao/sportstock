import { useState } from 'react';
import { Layout, Menu, Button, Avatar, Typography, Flex, Tag, Grid, Drawer } from 'antd';
import {
  DashboardOutlined, DatabaseOutlined, SwapOutlined,
  TeamOutlined, BankOutlined, LogoutOutlined, MenuOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

const ROLE_COLOR: Record<string, string> = {
  club_admin: 'blue',
  asset_manager: 'cyan',
  coach: 'green',
  super_admin: 'red',
};

const NAV_ITEMS = [
  { key: '/dashboard',       icon: <DashboardOutlined />, label: 'Overview' },
  { key: '/dashboard/assets', icon: <DatabaseOutlined />,  label: 'Assets' },
  { key: '/dashboard/loans',  icon: <SwapOutlined />,      label: 'Loans' },
  { key: '/dashboard/users',  icon: <TeamOutlined />,      label: 'Users',        adminOnly: true },
  { key: '/dashboard/club',   icon: <BankOutlined />,      label: 'Club Profile' },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const isAdmin = user?.role === 'club_admin';

  const menuItems = NAV_ITEMS
    .filter(item => !item.adminOnly || isAdmin)
    .map(({ key, icon, label }) => ({ key, icon, label }));

  const selectedKey =
    NAV_ITEMS.slice(1).find(item => location.pathname.startsWith(item.key))?.key
    ?? '/dashboard';

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    setDrawerOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isMobile = !screens.lg;
  const siderWidth = 220;

  const sideMenu = (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      items={menuItems}
      onClick={handleMenuClick}
      style={{ borderRight: 0, marginTop: 4 }}
    />
  );

  const logoArea = (mini: boolean) => (
    <Flex
      align="center"
      gap={10}
      style={{
        padding: mini ? '18px 0' : '18px 20px',
        justifyContent: mini ? 'center' : 'flex-start',
        borderBottom: '1px solid #f0f0f0',
        marginBottom: 4,
      }}
    >
      <div style={{
        width: 32, height: 32,
        background: 'linear-gradient(135deg, #1677ff, #0050b3)',
        borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <AppstoreOutlined style={{ color: '#fff', fontSize: 16 }} />
      </div>
      {!mini && <Text strong style={{ fontSize: 16, color: '#1a1a2e' }}>SportStock</Text>}
    </Flex>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop sidebar */}
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={siderWidth}
          style={{
            background: '#fff',
            borderRight: '1px solid #f0f0f0',
            position: 'fixed',
            height: '100vh',
            left: 0, top: 0,
            overflow: 'auto',
            zIndex: 100,
          }}
        >
          {logoArea(collapsed)}
          {sideMenu}
        </Sider>
      )}

      {/* Mobile drawer */}
      {isMobile && (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          placement="left"
          width={siderWidth}
          styles={{ body: { padding: 0 } }}
          title={
            <Flex align="center" gap={10}>
              <div style={{
                width: 28, height: 28,
                background: 'linear-gradient(135deg, #1677ff, #0050b3)',
                borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <AppstoreOutlined style={{ color: '#fff', fontSize: 14 }} />
              </div>
              <Text strong>SportStock</Text>
            </Flex>
          }
        >
          {sideMenu}
        </Drawer>
      )}

      <Layout style={{
        marginLeft: isMobile ? 0 : (collapsed ? 80 : siderWidth),
        transition: 'margin-left 0.2s',
      }}>
        <Header style={{
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          height: 56,
        }}>
          <Flex align="center" gap={12}>
            {isMobile && (
              <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />
            )}
            <Text strong style={{ fontSize: 15 }}>{user?.club_name ?? 'Dashboard'}</Text>
          </Flex>

          <Flex align="center" gap={10}>
            <Avatar size={32} style={{ background: '#1677ff', flexShrink: 0 }}>
              {user?.name?.[0]?.toUpperCase()}
            </Avatar>
            {!isMobile && (
              <div style={{ lineHeight: 1.3 }}>
                <Text strong style={{ fontSize: 13, display: 'block' }}>{user?.name}</Text>
                <Tag
                  color={ROLE_COLOR[user?.role ?? ''] ?? 'default'}
                  style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
                >
                  {user?.role?.replace(/_/g, ' ')}
                </Tag>
              </div>
            )}
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              size="small"
            >
              {!isMobile && 'Logout'}
            </Button>
          </Flex>
        </Header>

        <Content style={{
          padding: screens.md ? 24 : 16,
          background: '#f5f5f5',
          minHeight: 'calc(100vh - 56px)',
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
