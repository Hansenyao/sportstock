import { Tabs } from 'antd';
import WriteOffsTab from './tabs/WriteOffsTab';
import StocktakeTab from './tabs/StocktakeTab';

export default function StockManagementPage() {
  return (
    <Tabs
      defaultActiveKey="write-offs"
      items={[
        { key: 'write-offs', label: 'Write-offs', children: <WriteOffsTab /> },
        { key: 'stocktake',  label: 'Stocktake',  children: <StocktakeTab /> },
      ]}
    />
  );
}
