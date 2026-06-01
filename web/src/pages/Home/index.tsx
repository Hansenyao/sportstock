import { Button, Row, Col, Typography, Space, Grid } from 'antd';
import {
  AppstoreOutlined,
  SwapOutlined,
  BarChartOutlined,
  TeamOutlined,
  BellOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const { Title, Paragraph, Text } = Typography;
const { useBreakpoint } = Grid;

const features = [
  {
    icon: <AppstoreOutlined style={{ fontSize: 32, color: '#1677ff' }} />,
    title: 'Asset Management',
    desc: 'Track all club equipment — balls, jerseys, training gear — with real-time status and quantity.',
  },
  {
    icon: <SwapOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
    title: 'Loan Management',
    desc: 'Streamlined borrow/return workflow: request, approve, check-out, and return in a few taps.',
  },
  {
    icon: <BarChartOutlined style={{ fontSize: 32, color: '#faad14' }} />,
    title: 'Inventory Control',
    desc: 'Real-time stock levels, low-stock alerts, and stocktake sessions to keep counts accurate.',
  },
  {
    icon: <TeamOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
    title: 'Team Roles',
    desc: 'Role-based access for Club Admins, Asset Managers, and Coaches — everyone sees only what they need.',
  },
  {
    icon: <BellOutlined style={{ fontSize: 32, color: '#eb2f96' }} />,
    title: 'Push Notifications',
    desc: 'Instant alerts for loan approvals, overdue reminders, and low-stock warnings.',
  },
  {
    icon: <SafetyCertificateOutlined style={{ fontSize: 32, color: '#13c2c2' }} />,
    title: 'Financial Reports',
    desc: 'Track asset value and straight-line depreciation to keep your books accurate.',
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      {/* ── Navigation ── */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #f0f0f0',
          padding: isMobile ? '0 16px' : '0 48px',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => navigate('/')}>
          <div style={{
            width: 36, height: 36, background: 'linear-gradient(135deg, #1677ff, #0050b3)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AppstoreOutlined style={{ color: '#fff', fontSize: 18 }} />
          </div>
          <Text strong style={{ fontSize: 18, color: '#1a1a2e' }}>SportStock</Text>
        </div>

        {/* Nav actions */}
        <Space>
          {user ? (
            <>
              <Text style={{ color: '#595959' }}>Hi, {user.name}</Text>
              <Button onClick={logout}>Sign Out</Button>
            </>
          ) : (
            <>
              <Button onClick={() => navigate('/login')}>Sign In</Button>
              <Button type="primary" onClick={() => navigate('/register')}>
                Register Club
              </Button>
            </>
          )}
        </Space>
      </nav>

      {/* ── Hero ── */}
      <section
        style={{
          background: 'linear-gradient(135deg, #0a1628 0%, #1677ff 60%, #40a9ff 100%)',
          padding: isMobile ? '80px 24px 100px' : '120px 48px 140px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative circles */}
        <div style={{
          position: 'absolute', top: -80, right: -80, width: 300, height: 300,
          borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
        }} />
        <div style={{
          position: 'absolute', bottom: -60, left: -60, width: 200, height: 200,
          borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
        }} />

        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto' }}>
          <div style={{
            display: 'inline-block', background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.3)', borderRadius: 20,
            padding: '4px 16px', marginBottom: 24,
          }}>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
              Built for Youth Sports Clubs
            </Text>
          </div>

          <Title
            level={1}
            style={{
              color: '#fff', margin: '0 0 20px',
              fontSize: isMobile ? 36 : 54,
              lineHeight: 1.15,
              fontWeight: 700,
            }}
          >
            Manage Club Equipment<br />Without the Chaos
          </Title>

          <Paragraph
            style={{
              color: 'rgba(255,255,255,0.82)', fontSize: isMobile ? 16 : 18,
              margin: '0 0 40px', lineHeight: 1.7,
            }}
          >
            SportStock digitizes your club's asset management — track inventory,
            handle loan requests, and monitor finances all in one place.
            Accessible from any device, any time.
          </Paragraph>

          <Space size="middle" wrap style={{ justifyContent: 'center' }}>
            <Button
              type="primary" size="large"
              style={{ height: 48, padding: '0 32px', fontSize: 16, background: '#fff', color: '#1677ff', borderColor: '#fff' }}
              onClick={() => navigate('/register')}
            >
              Register Your Club — Free
            </Button>
            <Button
              size="large" ghost
              style={{ height: 48, padding: '0 32px', fontSize: 16, borderColor: 'rgba(255,255,255,0.6)', color: '#fff' }}
              onClick={() => navigate('/login')}
            >
              Sign In
            </Button>
          </Space>
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ padding: isMobile ? '64px 24px' : '96px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <Title level={2} style={{ marginBottom: 12, fontSize: isMobile ? 28 : 36 }}>
            Everything your club needs
          </Title>
          <Paragraph style={{ color: '#595959', fontSize: 16, margin: 0 }}>
            From daily loan requests to year-end financial reports — all in one platform.
          </Paragraph>
        </div>

        <Row gutter={[24, 24]}>
          {features.map((f) => (
            <Col key={f.title} xs={24} sm={12} lg={8}>
              <div
                style={{
                  background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12,
                  padding: 28, height: '100%',
                  transition: 'box-shadow 0.2s, transform 0.2s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 32px rgba(22,119,255,0.12)';
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                  (e.currentTarget as HTMLDivElement).style.transform = 'none';
                }}
              >
                <div style={{ marginBottom: 16 }}>{f.icon}</div>
                <Title level={4} style={{ marginBottom: 8 }}>{f.title}</Title>
                <Paragraph style={{ color: '#595959', margin: 0, lineHeight: 1.65 }}>{f.desc}</Paragraph>
              </div>
            </Col>
          ))}
        </Row>
      </section>

      {/* ── CTA Banner ── */}
      <section
        style={{
          background: 'linear-gradient(135deg, #e6f4ff, #bae0ff)',
          padding: isMobile ? '56px 24px' : '80px 48px',
          textAlign: 'center',
        }}
      >
        <Title level={2} style={{ marginBottom: 12, fontSize: isMobile ? 26 : 34 }}>
          Ready to get organised?
        </Title>
        <Paragraph style={{ color: '#595959', fontSize: 16, marginBottom: 32 }}>
          Register your club in under 2 minutes — no credit card required.
        </Paragraph>
        <Button
          type="primary" size="large"
          style={{ height: 48, padding: '0 40px', fontSize: 16 }}
          onClick={() => navigate('/register')}
        >
          Get Started Free
        </Button>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          background: '#0a1628', color: 'rgba(255,255,255,0.55)',
          padding: isMobile ? '32px 24px' : '40px 48px',
          display: 'flex', flexWrap: 'wrap', gap: 16,
          justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, background: '#1677ff', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AppstoreOutlined style={{ color: '#fff', fontSize: 14 }} />
          </div>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>SportStock</Text>
        </div>
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          © 2026 SportStock. All rights reserved.
        </Text>
      </footer>
    </div>
  );
}
