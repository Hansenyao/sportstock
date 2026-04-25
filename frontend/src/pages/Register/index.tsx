import { useState, useRef } from 'react';
import {
  Form, Input, Button, Typography, Card, Steps, Row, Col, Divider,
  Select, App, Grid, Space,
} from 'antd';
import {
  AppstoreOutlined, MailOutlined, LockOutlined, UserOutlined,
  PhoneOutlined, HomeOutlined, CheckCircleFilled, ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import * as authApi from '../../api/auth';
import type { RegisterData } from '../../api/auth';

const { Title, Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;

const SPORT_TYPES = [
  'Football', 'Basketball', 'Swimming', 'Tennis', 'Volleyball',
  'Baseball', 'Rugby', 'Hockey', 'Athletics', 'Other',
];

type Step = 'info' | 'verify' | 'done';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const screens = useBreakpoint();

  const [step, setStep] = useState<Step>('info');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const [infoForm] = Form.useForm();
  const [verifyForm] = Form.useForm();

  const stepIndex = step === 'info' ? 0 : step === 'verify' ? 1 : 2;

  // ── Step 1: Register ──────────────────────────────────────
  async function handleRegister(values: {
    club_name: string;
    sport_type?: string;
    address?: string;
    contact_email: string;
    name: string;
    email: string;
    password: string;
    confirm: string;
    phone?: string;
  }) {
    if (values.password !== values.confirm) {
      message.error('Passwords do not match.');
      return;
    }

    const data: RegisterData = {
      club: {
        name: values.club_name,
        sport_type: values.sport_type,
        address: values.address,
        contact_email: values.contact_email,
      },
      user: {
        name: values.name,
        email: values.email,
        password: values.password,
        phone: values.phone,
      },
    };

    setLoading(true);
    try {
      await authApi.register(data);
      setRegisteredEmail(values.email);
      setStep('verify');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Registration failed. Please try again.';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Verify email ──────────────────────────────────
  async function handleVerify(values: { code: string }) {
    setLoading(true);
    try {
      await authApi.verifyEmail(registeredEmail, values.code);
      setStep('done');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Invalid or expired code.';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Resend code ───────────────────────────────────────────
  async function handleResend() {
    setResendLoading(true);
    try {
      await authApi.resendVerification(registeredEmail);
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
          { title: 'Done' },
        ]}
      />

      {/* ── Step 1: Info form ── */}
      {step === 'info' && (
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
                <Form.Item name="sport_type" label="Sport Type" rules={[{ required: true, message: 'Sport type is required' }]}>
                  <Select placeholder="Select sport">
                    {SPORT_TYPES.map((s) => (
                      <Select.Option key={s} value={s}>{s}</Select.Option>
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
                  name="name" label="Your Name"
                  rules={[{ required: true, message: 'Your name is required' }]}
                >
                  <Input prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} placeholder="Full name" />
                </Form.Item>
              </Col>
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

            <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 44, marginTop: 8 }}>
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
              <Text strong>{registeredEmail}</Text>
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
              Verify Email
            </Button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
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
          </Form>
        </Card>
      )}

      {/* ── Step 3: Done ── */}
      {step === 'done' && (
        <Card
          style={{ maxWidth: 440, margin: '0 auto', borderRadius: 16, border: 'none', boxShadow: '0 4px 40px rgba(0,0,0,0.10)' }}
          styles={{ body: { padding: cardBodyPadding } }}
        >
          <div style={{ textAlign: 'center' }}>
            <CheckCircleFilled style={{ fontSize: 64, color: '#52c41a', marginBottom: 20 }} />
            <Title level={3} style={{ marginBottom: 8 }}>You're all set!</Title>
            <Paragraph style={{ color: '#595959', marginBottom: 32 }}>
              Your club and admin account have been created.
              Sign in to start managing your equipment.
            </Paragraph>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button type="primary" block size="large" style={{ height: 44 }} onClick={() => navigate('/login')}>
                Sign In Now
              </Button>
              <Button block size="large" style={{ height: 44 }} onClick={() => navigate('/')}>
                Back to Home
              </Button>
            </Space>
          </div>
        </Card>
      )}
    </div>
  );
}
