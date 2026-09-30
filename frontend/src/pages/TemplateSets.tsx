import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Tag, Popconfirm, Typography, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../utils/api';

interface TemplateSetItem {
  id: number;
  template_id: number;
  template_name: string;
  sort_order: number;
}

interface TemplateSet {
  id: number;
  name: string;
  employee_type: string;
  scenario: string;
  description: string;
  items: TemplateSetItem[];
  created_at: string;
}

interface SimpleTemplate {
  id: number;
  name: string;
}

const EMPLOYEE_TYPES = ['正式员工', '实习生', '兼职', '外包'];
const SCENARIOS = ['入职', '离职', '续签', '转正'];

export default function TemplateSets() {
  const [sets, setSets] = useState<TemplateSet[]>([]);
  const [templates, setTemplates] = useState<SimpleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateSet | null>(null);
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try {
      const [setsRes, tplRes] = await Promise.all([
        api.get('/api/v1/template-sets'),
        api.get('/api/v1/templates'),
      ]);
      setSets(setsRes.data);
      setTemplates(tplRes.data.map((t: any) => ({ id: t.id, name: t.name })));
    } catch {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (set: TemplateSet) => {
    setEditing(set);
    form.setFieldsValue({
      name: set.name,
      employee_type: set.employee_type,
      scenario: set.scenario,
      description: set.description,
      template_ids: set.items.map(i => i.template_id),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await api.put(`/api/v1/template-sets/${editing.id}`, values);
      } else {
        await api.post('/api/v1/template-sets', values);
      }
      message.success('保存成功');
      setModalOpen(false);
      fetch();
    } catch {
      message.error('保存失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/v1/template-sets/${id}`);
      message.success('已删除');
      fetch();
    } catch {
      message.error('删除失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '集合名称', dataIndex: 'name' },
    { title: '员工类型', dataIndex: 'employee_type', width: 100 },
    { title: '场景', dataIndex: 'scenario', width: 80 },
    {
      title: '包含模板',
      dataIndex: 'items',
      render: (items: TemplateSetItem[]) => items.map(i => <Tag key={i.id}>{i.template_name}</Tag>),
    },
    {
      title: '操作',
      width: 160,
      render: (_: any, record: TemplateSet) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>模板集合</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建集合</Button>
      </div>

      <Table dataSource={sets} columns={columns} rowKey="id" loading={loading} />

      <Modal
        title={editing ? '编辑集合' : '新建集合'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="集合名称" rules={[{ required: true, message: '请输入集合名称' }]}>
            <Input placeholder="例如：正式员工-入职" />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="employee_type" label="员工类型" rules={[{ required: true }]}>
              <Select style={{ width: 160 }} placeholder="选择员工类型">
                {EMPLOYEE_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="scenario" label="场景" rules={[{ required: true }]}>
              <Select style={{ width: 160 }} placeholder="选择场景">
                {SCENARIOS.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
              </Select>
            </Form.Item>
          </Space>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="template_ids" label="选择模板" rules={[{ required: true, message: '请选择至少一个模板' }]}>
            <Select mode="multiple" placeholder="选择该场景需要的合同模板">
              {templates.map(t => <Select.Option key={t.id} value={t.id}>{t.name}</Select.Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
