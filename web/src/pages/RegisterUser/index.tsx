import { useState } from 'react';
import { Form, Input, Button, Typography, Card, Steps, App, Grid } from 'antd';
import { MailOutlined, LockOutlined, UserOutlined, ArrowLeftOutlined, AppstoreOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import * as authApi from '../../api/auth';

const { Title, Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;
type Step = 'form' | 'verify';

export default function RegisterUserPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const screens = useBreakpoint();
  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [otpForm] = Form.useForm();

  async function handleRegister(values: { first_name: string; last_name: string; email: string; password: string; phone?: string }) {
    setLoading(true);
    try {
      await authApi.registerUser(values);
      setEmail(values.email);
      setStep('verify');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Registration failed.';
      message.error(msg);
    } finally { setLoading(false); }
  }

  async function handleVerify(values: { code: string }) {
    setLoading(true);
    try {
      await authApi.verifyEmail(email, values.code);
      message.success('Account created! Please sign in.');
      navigate('/login');
    } catch {
      message.error('Invalid or expired code.');
    } finally { setLoading(false); }
  }

  const cardStyle: React.CSSProperties = {
    width: '100%', maxWidth: 420, borderRadius: 16,
    boxShadow: '0 4px 40px rgba(0,0,0,0.10)', border: 'none',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #e6f4ff 0%, #f0f5ff 100%)', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => navigate('/')}>
            <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #1677ff, #0050b3)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AppstoreOutlined style={{ color: '#fff', fontSize: 22 }} />
            </div>
            <Text strong style={{ fontSize: 22, color: '#1a1a2e' }}>SportStock</Text>
          </div>
        </div>
        <Card style={cardStyle} styles={{ body: { padding: screens.xs ? '32px 24px' : '40px 36px' } }}>
          <Button type="text" icon={<ArrowLeftOutlined />} style={{ marginBottom: 16, padding: 0 }}
            onClick={() => step === 'verify' ? setStep('form') : navigate('/login')}>
            Back to Login
          </Button>
          <Title level={3} style={{ marginBottom: 4 }}>Create an Account</Title>
          <Paragraph style={{ color: '#8c8c8c', marginBottom: 24 }}>
            {step === 'form' ? 'Join an existing club after signing up.' : `Enter the code sent to ${email}.`}
          </Paragraph>
          <Steps current={step === 'form' ? 0 : 1} size="small" style={{ marginBottom: 24 }}
            items={[{ title: 'Your Info' }, { title: 'Verify Email' }]} />
          {step === 'form' ? (
            <Form form={form} layout="vertical" onFinish={handleRegister} size="large">
              <Form.Item name="first_name" label="First Name" rules={[{ required: true }]}>
                <Input prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} placeholder="First name" />
              </Form.Item>
              <Form.Item name="last_name" label="Last Name" rules={[{ required: true }]}>
                <Input prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} placeholder="Last name" />
              </Form.Item>
              <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />} placeholder="you@example.com" />
              </Form.Item>
              <Form.Item name="password" label="Password" rules={[{ required: true, min: 6 }]}>
                <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} placeholder="At least 6 characters" />
              </Form.Item>
              <Form.Item name="phone" label="Phone (optional)">
                <Input placeholder="+1 555 000 0000" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 44 }}>
                Create Account
              </Button>
            </Form>
          ) : (
            <Form form={otpForm} layout="vertical" onFinish={handleVerify} size="large">
              <Form.Item name="code" label="Verification Code" rules={[{ required: true, len: 6 }]}>
                <Input placeholder="6-digit code" maxLength={6}
                  style={{ letterSpacing: 6, textAlign: 'center', fontWeight: 600 }} />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 44 }}>
                Verify & Continue
              </Button>
            </Form>
          )}
        </Card>
      </div>
    </div>
  );
}
