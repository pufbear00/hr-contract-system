import { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Typography, message, Space,
  Tag, Popconfirm, Card, Checkbox,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../utils/api';

interface Company {
  id: number;
  company_name: string;
  company_name_en: string | null;
  legal_representative: string | null;
  address: string | null;
  postal_code: string | null;
  sign_city: string | null;
  work_city: string | null;
  is_default: number;
  data: Record<string, any>;
  created_at: string;
  updated_at: string | null;
}

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      const res = await api.get('/api/v1/companies', { params });
      setCompanies(res.data);
    } catch {
      message.error('获取公司列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCompanies(); }, [search]);

  const openEditModal = (company?: Company) => {
    setEditingCompany(company || null);
    if (company) {
      editForm.setFieldsValue({
        ...company,
        is_default: !!company.is_default,
      });
    } else {
      editForm.resetFields();
    }
    setEditModalOpen(true);
  };

  const handleSave = async () => {
    const values = await editForm.validateFields();
    values.is_default = values.is_default ? 1 : 0;
    setSaving(true);
    try {
      if (editingCompany) {
        await api.put(`/api/v1/companies/${editingCompany.id}`, values);
        message.success('更新成功');
      } else {
        await api.post('/api/v1/companies', values);
        message.success('创建成功');
      }
      setEditModalOpen(false);
      fetchCompanies();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/v1/companies/${id}`);
      message.success('删除成功');
      fetchCompanies();
    } catch {
      message.error('删除失败');
    }
  };

  const handleSetDefault = async (company: Company) => {
    try {
      await api.put(`/api/v1/companies/${company.id}`, { is_default: 1 });
      message.success(`已将「${company.company_name}」设为默认`);
      fetchCompanies();
    } catch {
      message.error('设置失败');
    }
  };

  const columns = [
    {
      title: '公司名称', dataIndex: 'company_name', key: 'company_name',
      render: (name: string, record: Company) => (
        <Space>
          {name}
          {record.is_default ? <Tag color="blue">默认</Tag> : null}
        </Space>
      ),
    },
    { title: '英文名', dataIndex: 'company_name_en', key: 'company_name_en', render: (v: string | null) => v || '-' },
    { title: '法定代表人', dataIndex: 'legal_representative', key: 'legal_representative', width: 120, render: (v: string | null) => v || '-' },
    { title: '公司地址', dataIndex: 'address', key: 'address', ellipsis: true, render: (v: string | null) => v || '-' },
    { title: '邮编', dataIndex: 'postal_code', key: 'postal_code', width: 80, render: (v: string | null) => v || '-' },
    { title: '签约城市', dataIndex: 'sign_city', key: 'sign_city', width: 100, render: (v: string | null) => v || '-' },
    { title: '工作城市', dataIndex: 'work_city', key: 'work_city', width: 100, render: (v: string | null) => v || '-' },
    {
      title: '操作', key: 'action', width: 240,
      render: (_: any, record: Company) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>编辑</Button>
          {!record.is_default && (
            <Button size="small" type="link" onClick={() => handleSetDefault(record)}>设为默认</Button>
          )}
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>公司管理</Typography.Title>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索公司名称"
            allowClear
            style={{ width: 300 }}
            onSearch={setSearch}
            prefix={<SearchOutlined />}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditModal()}>
            新增公司
          </Button>
        </Space>
      </Card>

      <Table
        columns={columns}
        dataSource={companies}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
      />

      <Modal
        title={editingCompany ? '编辑公司' : '新增公司'}
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={600}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="company_name" label="公司名称" rules={[{ required: true, message: '请输入公司名称' }]}>
            <Input placeholder="如：示例科技有限公司（仅虚构资料）" />
          </Form.Item>
          <Form.Item name="company_name_en" label="公司英文名">
            <Input placeholder="如：Example Technology Co., Ltd." />
          </Form.Item>
          <Form.Item name="legal_representative" label="法定代表人">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="公司地址">
            <Input placeholder="仅填写虚构的演示地址" />
          </Form.Item>
          <Form.Item name="postal_code" label="邮编">
            <Input placeholder="如：311121" style={{ width: 200 }} />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="sign_city" label="签约城市">
              <Input placeholder="演示城市" style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="work_city" label="工作城市">
              <Input placeholder="演示城市" style={{ width: 200 }} />
            </Form.Item>
          </Space>
          <Form.Item name="is_default" valuePropName="checked">
            <Checkbox>设为默认公司</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
