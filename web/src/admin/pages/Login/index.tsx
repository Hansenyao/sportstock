// frontend/src/admin/pages/Login/index.tsx
import { Form, Input, Button, Typography, Alert, Card } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import type { AuthUser } from '../../../types';

const { Title, Text } = Typography;

interface LoginForm {
  email: string;
  password: string;
}

export default function AdminLoginPage() {
  const { login } = useAdminAuth();
  const navigate   = useNavigate();
  const [loading, setLoading]     = useState(false);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  const handleSubmit = async (values: LoginForm) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await axios.post<{ token: string; user: AuthUser }>(
        `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/auth/login`,
        { email: values.email, password: values.password }
      );
      if (res.data.user.role !== 'super_admin') {
        setErrorMsg('This portal is for platform administrators only.');
        return;
      }
      login(res.data.token, res.data.user);
      navigate('/admin/dashboard');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setErrorMsg(err.response?.data?.message ?? 'Login failed.');
      } else {
        setErrorMsg('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0a0a0a',
    }}>
      <Card style={{ width: 380, background: '#141414', border: '1px solid #1f1f1f' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Text style={{ color: '#444', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2 }}>
            SportStock
          </Text>
          <Title level={4} style={{ color: '#fff', margin: '8px 0 0' }}>
            Platform Admin
          </Title>
        </div>

        {errorMsg && (
          <Alert message={errorMsg} type="error" showIcon style={{ marginBottom: 16 }} />
        )}

        <Form layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item
            name="email"
            rules={[{ required: true, message: 'Email is required' }, { type: 'email', message: 'Enter a valid email' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="Email" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Password is required' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              Sign In
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
