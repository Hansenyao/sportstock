import { useState, useEffect } from 'react';
import {
  Form, Input, Button, Typography, Card, Steps, Row, Col, Divider,
  Select, App, Grid, Space,
} from 'antd';
import {
  AppstoreOutlined, MailOutlined, LockOutlined, UserOutlined,
  PhoneOutlined, HomeOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import * as authApi from '../../api/auth';
import { setToken } from '../../api/client';
import client from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

const { Title, Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;

interface SportType { id: string; name: string; }

type RegisterStep = 'form' | 'verify';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { login } = useAuth();
  const screens = useBreakpoint();

  const [step, setStep] = useState<RegisterStep>('form');
  const [loading, setLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [sportTypes, setSportTypes] = useState<SportType[]>([]);

  // State preserved across steps
  const [storedEmail, setStoredEmail] = useState('');
  const [storedPassword, setStoredPassword] = useState('');
  const [storedClub, setStoredClub] = useState<{
    club_name: string;
    sport_type_id: string;
    contact_email: string;
    address?: string;
  } | null>(null);

  const [infoForm] = Form.useForm();
  const [verifyForm] = Form.useForm();

  useEffect(() => {
    client.get<SportType[] | { data: SportType[] }>('/sport-types')
      .then((res) => {
        const raw = res.data;
        setSportTypes(Array.isArray(raw) ? raw : (raw as { data: SportType[] }).data ?? []);
      })
      .catch(() => { /* silently ignore — user can still type */ });
  }, []);

  const stepIndex = step === 'form' ? 0 : 1;

  // ── Step 1: Register (user data only) ────────────────────────
  async function handleRegister(values: {
    club_name: string;
    sport_type_id?: string;
    address?: string;
    contact_email: string;
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    confirm: string;
    phone?: string;
  }) {
    if (values.password !== values.confirm) {
      message.error('Passwords do not match.');
      return;
    }

    setRegisterLoading(true);
    try {
      await authApi.registerClub({
        user: {
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email,
          password: values.password,
          phone: values.phone,
        },
        club: {
          name: values.club_name,
          sport_type_id: values.sport_type_id ?? '',
          address: values.address,
          contact_email: values.contact_email,
        },
      });
      // Preserve data needed for later steps
      setStoredEmail(values.email);
      setStoredPassword(values.password);
      setStoredClub({
        club_name: values.club_name,
        sport_type_id: values.sport_type_id ?? '',
        contact_email: values.contact_email,
        address: values.address,
      });
      setStep('verify');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Registration failed. Please try again.';
      message.error(msg);
    } finally {
      setRegisterLoading(false);
    }
  }

  // ── Step 2: Verify email → login → create club → navigate ────
  async function handleVerify(values: { code: string }) {
    if (!storedClub) return;
    setLoading(true);
    try {
      // 1. Verify OTP
      await authApi.verifyEmail(storedEmail, values.code);

      // 2. Login to get a token
      const loginRes = await authApi.login(storedEmail, storedPassword);

      // 3. Apply token immediately so the register-club call is authenticated
      setToken(loginRes.data.token);

      // 4. Create the club
      const clubRes = await authApi.createClub(storedClub);

      // 5. Fully initialize auth context (fetches /me, selects club, etc.)
      await login(loginRes.data);

      message.success(`Club "${clubRes.data.club_name}" created!`);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Invalid or expired code.';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Resend code ───────────────────────────────────────────────
  async function handleResend() {
    setResendLoading(true);
    try {
      await authApi.resendVerification(storedEmail);
      message.success('A new code has been sent to your email.');
    } catch {
      message.error('Failed to resend. Please wait a moment and try again.');
    } finally {
      setResendLoading(false);
    }
  }

  const cardBodyPadding = screens.xs ? '28px 20px' : '40px 36px';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #e6f4ff 0%, #f0f5ff 100%)',
      padding: screens.md ? '48px 24px' : '24px 16px',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <div style={{
            width: 44, height: 44, background: 'linear-gradient(135deg, #1677ff, #0050b3)',
            borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AppstoreOutlined style={{ color: '#fff', fontSize: 22 }} />
          </div>
          <Text strong style={{ fontSize: 22, color: '#1a1a2e' }}>SportStock</Text>
        </div>
        <Title level={3} style={{ marginTop: 16, marginBottom: 4 }}>Register Your Club</Title>
        <Paragraph style={{ color: '#8c8c8c', margin: 0 }}>
          Get started in under 2 minutes — no credit card required.
        </Paragraph>
      </div>

      {/* Steps indicator */}
      <Steps
        current={stepIndex}
        size="small"
        style={{ maxWidth: 480, margin: '0 auto 32px' }}
        items={[
          { title: 'Club & Account' },
          { title: 'Verify Email' },
        ]}
      />

      {/* ── Step 1: Info form ── */}
      {step === 'form' && (
        <Card
          style={{ maxWidth: 600, margin: '0 auto', borderRadius: 16, border: 'none', boxShadow: '0 4px 40px rgba(0,0,0,0.10)' }}
          styles={{ body: { padding: cardBodyPadding } }}
        >
          <Form form={infoForm} layout="vertical" onFinish={handleRegister} size="large">
            {/* Club section */}
            <Text strong style={{ fontSize: 15, color: '#1a1a2e', display: 'block', marginBottom: 16 }}>
              Club Information
            </Text>

            <Row gutter={16}>
              <Col xs={24} sm={14}>
                <Form.Item
                  name="club_name" label="Club Name"
                  rules={[{ required: true, message: 'Club name is required' }]}
                >
                  <Input prefix={<HomeOutlined style={{ color: '#bfbfbf' }} />} placeholder="e.g. City Youth FC" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={10}>
                <Form.Item name="sport_type_id" label="Sport Type" rules={[{ required: true, message: 'Sport type is required' }]}>
                  <Select placeholder="Select sport" showSearch optionFilterProp="children">
                    {sportTypes.map((s) => (
                      <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="contact_email" label="Club Contact Email"
                  rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
                >
                  <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />} placeholder="club@example.com" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="address" label="Address (optional)">
                  <Input placeholder="City, Country" />
                </Form.Item>
              </Col>
            </Row>

            <Divider style={{ margin: '8px 0 20px' }} />

            {/* Personal section */}
            <Text strong style={{ fontSize: 15, color: '#1a1a2e', display: 'block', marginBottom: 16 }}>
              Your Account
            </Text>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="first_name" label="First Name"
                  rules={[{ required: true, message: 'First name is required' }]}
                >
                  <Input prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} placeholder="First name" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="last_name" label="Last Name"
                  rules={[{ required: true, message: 'Last name is required' }]}
                >
                  <Input prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} placeholder="Last name" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item name="phone" label="Phone (optional)">
                  <Input prefix={<PhoneOutlined style={{ color: '#bfbfbf' }} />} placeholder="+1 234 567 8900" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="email" label="Your Email"
              rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
            >
              <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />} placeholder="you@example.com" />
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="password" label="Password"
                  rules={[{ required: true, min: 6, message: 'At least 6 characters' }]}
                >
                  <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} placeholder="Min 6 characters" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="confirm" label="Confirm Password"
                  rules={[{ required: true, message: 'Please confirm your password' }]}
                >
                  <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} placeholder="Repeat password" />
                </Form.Item>
              </Col>
            </Row>

            <Button type="primary" htmlType="submit" block loading={registerLoading} style={{ height: 44, marginTop: 8 }}>
              Register Club
            </Button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Text style={{ color: '#8c8c8c' }}>Already have an account? </Text>
              <Button type="link" style={{ padding: 0 }} onClick={() => navigate('/login')}>
                Sign in
              </Button>
            </div>
          </Form>
        </Card>
      )}

      {/* ── Step 2: Verify email ── */}
      {step === 'verify' && (
        <Card
          style={{ maxWidth: 440, margin: '0 auto', borderRadius: 16, border: 'none', boxShadow: '0 4px 40px rgba(0,0,0,0.10)' }}
          styles={{ body: { padding: cardBodyPadding } }}
        >
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{
              width: 64, height: 64, background: '#e6f4ff', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <MailOutlined style={{ fontSize: 28, color: '#1677ff' }} />
            </div>
            <Title level={4} style={{ marginBottom: 8 }}>Check your email</Title>
            <Paragraph style={{ color: '#595959', margin: 0 }}>
              We sent a 6-digit code to<br />
              <Text strong>{storedEmail}</Text>
            </Paragraph>
          </div>

          <Form form={verifyForm} layout="vertical" onFinish={handleVerify}>
            <Form.Item
              name="code" label="Verification Code"
              rules={[{ required: true, len: 6, message: 'Enter the 6-digit code from your email' }]}
            >
              <Input
                placeholder="000000" maxLength={6} size="large"
                style={{ letterSpacing: 8, textAlign: 'center', fontSize: 22, fontWeight: 700 }}
              />
            </Form.Item>

            <Button type="primary" htmlType="submit" block size="large" loading={loading} style={{ height: 44 }}>
              Verify &amp; Create Club
            </Button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <div>
                  <Text style={{ color: '#8c8c8c' }}>Didn't receive it? </Text>
                  <Button
                    type="link" style={{ padding: 0 }}
                    icon={<ReloadOutlined />}
                    loading={resendLoading}
                    onClick={handleResend}
                  >
                    Resend code
                  </Button>
                </div>
                <Button type="link" style={{ padding: 0 }} onClick={() => setStep('form')}>
                  &larr; Back
                </Button>
              </Space>
            </div>
          </Form>
        </Card>
      )}
    </div>
  );
}
