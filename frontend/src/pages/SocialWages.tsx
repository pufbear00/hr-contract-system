import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Typography, message, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../utils/api';

interface SocialWage {
  id: number;
  year: number;
  annual_amount: number;
  monthly_cap: number;
  city: string;
}

export default function SocialWages() {
  const [data, setData] = useState<SocialWage[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/v1/social-wages');
      setData(res.data);
    } catch {
      message.error('获取失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      await api.post('/api/v1/social-wages', values);
      message.success('添加成功');
      setModalOpen(false);
      form.resetFields();
      fetchData();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '添加失败');
    }
  };

  const handleDelete = async (id: number) => {
    await api.delete(`/api/v1/social-wages/${id}`);
    message.success('已删除');
    fetchData();
  };

  const columns = [
    { title: '年份', dataIndex: 'year', width: 100 },
    { title: '城市', dataIndex: 'city', width: 100 },
    {
      title: '年平均工资(元)',
      dataIndex: 'annual_amount',
      width: 150,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '月均3倍上限(元)',
      dataIndex: 'monthly_cap',
      width: 160,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '操作', width: 80,
      render: (_: any, record: SocialWage) => (
        <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - i).map(y => ({
    value: y, label: `${y}年`,
  }));

  return (
    <div>
      <Typography.Title level={4}>社平工资管理</Typography.Title>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        用于计算经济补偿金 N 部分的月均工资上限（年平均工资 / 12 * 3）
      </Typography.Text>

      <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }} style={{ marginBottom: 16 }}>
        添加年度数据
      </Button>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={columns}
        size="small"
        pagination={false}
      />

      <Modal
        title="添加社平工资数据"
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={400}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="year" label="年份" rules={[{ required: true }]}>
            <Select options={yearOptions} />
          </Form.Item>
          <Form.Item name="annual_amount" label="年平均工资(元)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} precision={0} />
          </Form.Item>
          <Form.Item name="city" label="城市" rules={[{ required: true }]}>
            <Input placeholder="演示城市" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
