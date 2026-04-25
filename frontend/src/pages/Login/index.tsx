import { useState } from 'react';
import {
  Form, Input, Button, Typography, Card, Divider, Space, Steps, App, Grid,
} from 'antd';
import {
  MailOutlined, LockOutlined, AppstoreOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import * as authApi from '../../api/auth';

const { Title, Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;

type ForgotStep = 'email' | 'reset';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { message } = App.useApp();
  const screens = useBreakpoint();

  const [loginLoading, setLoginLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotStep>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const [loginForm] = Form.useForm();
  const [forgotForm] = Form.useForm();

  // ── Login submit ──────────────────────────────────────────
  async function handleLogin(values: { email: string; password: string }) {
    setLoginLoading(true);
    try {
      const res = await authApi.login(values.email, values.password);
      login(res.data.token, res.data.user);
      message.success(`Welcome back, ${res.data.user.name}!`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Login failed. Please try again.';
      message.error(msg);
    } finally {
      setLoginLoading(false);
    }
  }

  // ── Forgot password: send code ────────────────────────────
  async function handleForgotEmail(values: { email: string }) {
    setForgotLoading(true);
    try {
      await authApi.forgotPassword(values.email);
      setForgotEmail(values.email);
      setForgotStep('reset');
      message.success('If this email exists, a reset code has been sent.');
    } catch {
      message.error('Something went wrong. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  }

  // ── Forgot password: reset ────────────────────────────────
  async function handleReset(values: { code: string; new_password: string; confirm: string }) {
    if (values.new_password !== values.confirm) {
      message.error('Passwords do not match.');
      return;
    }
    setForgotLoading(true);
    try {
      await authApi.resetPassword(forgotEmail, values.code, values.new_password);
      message.success('Password reset successfully. Please log in.');
      setShowForgot(false);
      setForgotStep('email');
      forgotForm.resetFields();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Invalid or expired code.';
      message.error(msg);
    } finally {
      setForgotLoading(false);
    }
  }

  function closeForgot() {
    setShowForgot(false);
    setForgotStep('email');
    forgotForm.resetFields();
  }

  const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    boxShadow: '0 4px 40px rgba(0,0,0,0.10)',
    border: 'none',
  };

  // ── Forgot password panel ─────────────────────────────────
  if (showForgot) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #e6f4ff 0%, #f0f5ff 100%)',
        padding: '24px 16px',
      }}>
        <Card style={cardStyle} styles={{ body: { padding: '40px 36px' } }}>
          <Button
            type="text" icon={<ArrowLeftOutlined />}
            style={{ marginBottom: 16, padding: 0, color: '#595959' }}
            onClick={closeForgot}
          >
            Back to Login
          </Button>

          <Title level={3} style={{ marginBottom: 4 }}>Reset Password</Title>
          <Paragraph style={{ color: '#8c8c8c', marginBottom: 28 }}>
            {forgotStep === 'email'
              ? 'Enter your email and we\'ll send a reset code.'
              : `Code sent to ${forgotEmail}. Enter it below.`}
          </Paragraph>

          <Steps
            current={forgotStep === 'email' ? 0 : 1}
            size="small"
            style={{ marginBottom: 28 }}
            items={[{ title: 'Send Code' }, { title: 'Reset' }]}
          />

          <Form form={forgotForm} layout="vertical" onFinish={forgotStep === 'email' ? handleForgotEmail : handleReset}>
            {forgotStep === 'email' ? (
              <Form.Item
                name="email" label="Email"
                rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
              >
                <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />} placeholder="you@example.com" size="large" />
              </Form.Item>
            ) : (
              <>
                <Form.Item
                  name="code" label="Verification Code"
                  rules={[{ required: true, len: 6, message: 'Enter the 6-digit code' }]}
                >
                  <Input placeholder="6-digit code" size="large" maxLength={6}
                    style={{ letterSpacing: 6, textAlign: 'center', fontWeight: 600 }} />
                </Form.Item>
                <Form.Item
                  name="new_password" label="New Password"
                  rules={[{ required: true, min: 6, message: 'At least 6 characters' }]}
                >
                  <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} placeholder="New password" size="large" />
                </Form.Item>
                <Form.Item
                  name="confirm" label="Confirm Password"
                  rules={[{ required: true, message: 'Please confirm your password' }]}
                >
                  <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} placeholder="Confirm new password" size="large" />
                </Form.Item>
              </>
            )}
            <Button type="primary" htmlType="submit" block size="large" loading={forgotLoading} style={{ height: 44 }}>
              {forgotStep === 'email' ? 'Send Reset Code' : 'Reset Password'}
            </Button>
          </Form>
        </Card>
      </div>
    );
  }

  // ── Login form ────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #e6f4ff 0%, #f0f5ff 100%)',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            cursor: 'pointer',
          }} onClick={() => navigate('/')}>
            <div style={{
              width: 44, height: 44, background: 'linear-gradient(135deg, #1677ff, #0050b3)',
              borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AppstoreOutlined style={{ color: '#fff', fontSize: 22 }} />
            </div>
            <Text strong style={{ fontSize: 22, color: '#1a1a2e' }}>SportStock</Text>
          </div>
        </div>

        <Card style={cardStyle} styles={{ body: { padding: screens.xs ? '32px 24px' : '40px 36px' } }}>
          <Title level={3} style={{ marginBottom: 4, textAlign: 'center' }}>Welcome back</Title>
          <Paragraph style={{ color: '#8c8c8c', textAlign: 'center', marginBottom: 28 }}>
            Sign in to your account
          </Paragraph>

          <Form form={loginForm} layout="vertical" onFinish={handleLogin} size="large">
            <Form.Item
              name="email" label="Email"
              rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
            >
              <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />} placeholder="you@example.com" />
            </Form.Item>

            <Form.Item
              name="password" label="Password"
              rules={[{ required: true, message: 'Password is required' }]}
            >
              <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} placeholder="Your password" />
            </Form.Item>

            <div style={{ textAlign: 'right', marginTop: -16, marginBottom: 16 }}>
              <Button type="link" style={{ padding: 0, height: 'auto', fontSize: 13 }} onClick={() => setShowForgot(true)}>
                Forgot password?
              </Button>
            </div>

            <Button type="primary" htmlType="submit" block loading={loginLoading} style={{ height: 44 }}>
              Sign In
            </Button>
          </Form>

          <Divider style={{ margin: '24px 0' }}>
            <Text style={{ color: '#bfbfbf', fontSize: 12 }}>Don't have an account?</Text>
          </Divider>

          <Space direction="vertical" style={{ width: '100%' }}>
            <Button block style={{ height: 44 }} onClick={() => navigate('/register')}>
              Register Your Club
            </Button>
          </Space>
        </Card>
      </div>
    </div>
  );
}
