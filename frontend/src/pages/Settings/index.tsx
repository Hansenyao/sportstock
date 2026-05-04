import { Typography } from 'antd';
import ClubInfoSection from './sections/ClubInfoSection';
import AlertThresholdsSection from './sections/AlertThresholdsSection';

const { Title } = Typography;

export default function SettingsPage() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 20, marginTop: 0 }}>Settings</Title>
      <ClubInfoSection />
      <AlertThresholdsSection />
    </div>
  );
}
