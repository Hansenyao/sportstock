import { useState } from 'react';
import {
  Layout, Menu, Button, Avatar, Typography, Flex, Tag, Grid, Drawer,
  Badge, Dropdown,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined, DatabaseOutlined, SwapOutlined, TeamOutlined,
  SettingOutlined, LogoutOutlined, MenuOutlined, AppstoreOutlined,
  DeleteOutlined, TrophyOutlined, TagOutlined, BarChartOutlined,
  BellOutlined, UserOutlined, PlusOutlined, InboxOutlined, GoldOutlined,
  AuditOutlined, BankOutlined, DownOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ClubRole } from '../types';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

const ROLE_COLOR: Record<ClubRole, string> = {
  club_admin:    'blue',
  asset_manager: 'cyan',
  coach:         'green',
  accountant:    'purple',
};

type NavItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  roles: ClubRole[] | null; // null = all roles when club is active
  requiresClub: boolean;
};

type NavGroup = {
  label?: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { key: '/dashboard', icon: <DashboardOutlined />, label: 'Overview', roles: null, requiresClub: false },
    ],
  },
  {
    label: 'Equipment',
    items: [
      { key: '/dashboard/warehouses',  icon: <BankOutlined />,     label: 'Warehouse',   roles: ['club_admin','asset_manager'], requiresClub: true },
      { key: '/dashboard/asset-names', icon: <TagOutlined />,      label: 'Asset Name',  roles: ['club_admin','asset_manager'], requiresClub: true },
      { key: '/dashboard/inventory',   icon: <DatabaseOutlined />, label: 'Inventory',   roles: null,                          requiresClub: true },
      { key: '/dashboard/kits',        icon: <GoldOutlined />,     label: 'Kits',        roles: ['club_admin','asset_manager'], requiresClub: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: '/dashboard/loans',   icon: <SwapOutlined />,     label: 'Loans',            roles: null,                                        requiresClub: true },
      { key: '/dashboard/stock',   icon: <DeleteOutlined />,   label: 'Stock Management', roles: ['club_admin','asset_manager'],               requiresClub: true },
      { key: '/dashboard/reports', icon: <BarChartOutlined />, label: 'Reports',          roles: ['club_admin','asset_manager','accountant'],  requiresClub: true },
    ],
  },
  {
    label: 'Management',
    items: [
      { key: '/dashboard/users',      icon: <TeamOutlined />,    label: 'Users',      roles: ['club_admin'], requiresClub: true },
      { key: '/dashboard/teams',      icon: <TrophyOutlined />,  label: 'Teams',      roles: ['club_admin'], requiresClub: true },
      { key: '/dashboard/audit-logs', icon: <AuditOutlined />,   label: 'Audit Logs', roles: ['club_admin'], requiresClub: true },
      { key: '/dashboard/settings',   icon: <SettingOutlined />, label: 'Settings',   roles: ['club_admin'], requiresClub: true },
    ],
  },
];

export default function DashboardLayout() {
  const { user, activeClub, logout, selectClub, pendingInvitationCount } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const role = activeClub?.role ?? null;

  // Filter visible items
  const visibleGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (item.requiresClub && !activeClub) return false;
      if (item.roles === null) return true;
      return role ? item.roles.includes(role) : false;
    }),
  })).filter(g => g.items.length > 0);

  // Build antd Menu items with group labels
  const menuItems: MenuProps['items'] = visibleGroups.flatMap(group => {
    const items: MenuProps['items'] = group.items.map(item => ({
      key: item.key,
      icon: item.icon,
      label: item.label,
    }));
    if (group.label) {
      return [{ type: 'group' as const, label: group.label, children: items }];
    }
    return items;
  });

  const allNavKeys = NAV_GROUPS.flatMap(g => g.items.map(i => i.key));
  const selectedKey =
    allNavKeys.filter(k => k !== '/dashboard').find(k => location.pathname.startsWith(k))
    ?? '/dashboard';

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    setDrawerOpen(false);
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const isMobile = !screens.lg;
  const siderWidth = 220;

  // Club switcher dropdown
  const clubItems: MenuProps['items'] = [
    ...(user?.clubs ?? []).map(c => ({
      key: c.club_id,
      label: (
        <Flex align="center" justify="space-between" gap={8}>
          <Flex align="center" gap={8}>
            <Avatar shape="square" size={20} src={c.logo_url ?? undefined}
              style={{ background: '#1677ff', flexShrink: 0, fontSize: 11 }}>
              {!c.logo_url && c.club_name.charAt(0).toUpperCase()}
            </Avatar>
            <span>{c.club_name}</span>
          </Flex>
          <Tag style={{ margin: 0, fontSize: 10 }}>{c.role.replace(/_/g, ' ')}</Tag>
        </Flex>
      ),
    })),
    { type: 'divider' as const },
    { key: '__create', icon: <PlusOutlined />, label: 'Create New Club' },
  ];

  const handleClubSelect: MenuProps['onClick'] = ({ key }) => {
    if (key === '__create') { navigate('/dashboard/create-club'); return; }
    void selectClub(key).then(() => navigate(location.pathname));
  };

  // User avatar dropdown
  const userMenuItems: MenuProps['items'] = [
    { key: 'profile',  icon: <UserOutlined />,  label: 'Profile' },
    {
      key: 'clubs',
      icon: <InboxOutlined />,
      label: (
        <Flex gap={8} align="center">
          My Clubs
          {pendingInvitationCount > 0 && (
            <Badge count={pendingInvitationCount} size="small" />
          )}
        </Flex>
      ),
    },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true },
  ];

  const handleUserMenu: MenuProps['onClick'] = ({ key }) => {
    if (key === 'profile') navigate('/dashboard/profile');
    else if (key === 'clubs') navigate('/dashboard/clubs');
    else if (key === 'logout') handleLogout();
  };

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
      align="center" gap={10}
      style={{
        padding: mini ? '18px 0' : '18px 20px',
        justifyContent: mini ? 'center' : 'flex-start',
        borderBottom: '1px solid #f0f0f0', marginBottom: 4,
      }}
    >
      <div style={{
        width: 32, height: 32,
        background: 'linear-gradient(135deg, #1677ff, #0050b3)',
        borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <AppstoreOutlined style={{ color: '#fff', fontSize: 16 }} />
      </div>
      {!mini && <Text strong style={{ fontSize: 16, color: '#1a1a2e' }}>SportStock</Text>}
    </Flex>
  );

  const fullName = user ? `${user.first_name} ${user.last_name}` : '';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} width={siderWidth}
          style={{ background: '#fff', borderRight: '1px solid #f0f0f0', position: 'fixed', height: '100vh', left: 0, top: 0, overflow: 'auto', zIndex: 100 }}>
          {logoArea(collapsed)}
          {sideMenu}
        </Sider>
      )}

      {isMobile && (
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} placement="left" width={siderWidth}
          styles={{ body: { padding: 0 } }}
          title={
            <Flex align="center" gap={10}>
              <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, #1677ff, #0050b3)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AppstoreOutlined style={{ color: '#fff', fontSize: 14 }} />
              </div>
              <Text strong>SportStock</Text>
            </Flex>
          }>
          {sideMenu}
        </Drawer>
      )}

      <Layout style={{ marginLeft: isMobile ? 0 : (collapsed ? 80 : siderWidth), transition: 'margin-left 0.2s' }}>
        <Header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10, height: 56 }}>
          <Flex align="center" gap={12}>
            {isMobile && <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />}

            {/* Club switcher */}
            {user && user.clubs.length > 0 ? (
              <Dropdown menu={{ items: clubItems, onClick: handleClubSelect }} trigger={['click']}>
                <Button type="default" style={{ borderColor: '#91caff', color: '#1677ff', background: '#e6f4ff' }}>
                  <Flex align="center" gap={6}>
                    <span>{activeClub?.club_name ?? 'Select Club'}</span>
                    {user.clubs.length > 1 && <DownOutlined style={{ fontSize: 10 }} />}
                  </Flex>
                </Button>
              </Dropdown>
            ) : (
              <Text type="secondary" style={{ fontSize: 13 }}>No Club</Text>
            )}
          </Flex>

          <Flex align="center" gap={12}>
            {/* Notification bell */}
            <Badge count={pendingInvitationCount} size="small">
              <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} onClick={() => navigate('/dashboard/clubs')} />
            </Badge>

            {/* User avatar dropdown */}
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenu }} trigger={['click']}>
              <Flex align="center" gap={8} style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                <Avatar size={32} src={user?.avatar_url ?? undefined} style={{ background: '#1677ff', flexShrink: 0 }}>
                  {user?.first_name?.[0]?.toUpperCase()}
                </Avatar>
                {!isMobile && (
                  <div style={{ lineHeight: 1.3 }}>
                    <Text strong style={{ fontSize: 13, display: 'block' }}>{fullName}</Text>
                    {role && (
                      <Tag color={ROLE_COLOR[role]} style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                        {role.replace(/_/g, ' ')}
                      </Tag>
                    )}
                  </div>
                )}
                <DownOutlined style={{ fontSize: 10, color: '#bbb' }} />
              </Flex>
            </Dropdown>
          </Flex>
        </Header>

        <Content style={{ padding: screens.md ? 24 : 16, background: '#f5f5f5', minHeight: 'calc(100vh - 56px)' }}>
          {/* No-club state */}
          {!activeClub && location.pathname === '/dashboard' ? (
            <Flex vertical align="center" justify="center" style={{ minHeight: '60vh', gap: 16 }}>
              <Text type="secondary" style={{ fontSize: 16 }}>You are not a member of any club yet.</Text>
              <Flex gap={12}>
                <Button type="primary" onClick={() => navigate('/dashboard/create-club')}>Create a Club</Button>
                <Button onClick={() => navigate('/dashboard/clubs')}>View Pending Invitations</Button>
              </Flex>
            </Flex>
          ) : (
            <Outlet />
          )}
        </Content>
      </Layout>
    </Layout>
  );
}
