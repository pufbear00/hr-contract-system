import { useState, useEffect } from 'react';
import { Table, Button, Upload, message, Modal, Form, Input, Select, Space, Tag, Popconfirm, Typography } from 'antd';
import { UploadOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../utils/api';

interface Variable {
  label: string;
  type: string;
  required: boolean;
  options: string[];
}

interface Template {
  id: number;
  name: string;
  original_filename: string;
  variables: string[];
  variable_schema: Record<string, Variable>;
  created_at: string;
}

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [current, setCurrent] = useState<Template | null>(null);
  const [form] = Form.useForm();

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/v1/templates');
      setTemplates(res.data);
    } catch {
      message.error('获取模板列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post('/api/v1/templates/upload', formData);
      message.success('上传成功');
      fetchTemplates();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '上传失败');
    }
    return false;
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/v1/templates/${id}`);
      message.success('已删除');
      fetchTemplates();
    } catch {
      message.error('删除失败');
    }
  };

  const openEdit = (tpl: Template) => {
    setCurrent(tpl);
    form.setFieldsValue({
      name: tpl.name,
      schema: Object.entries(tpl.variable_schema).map(([key, val]) => ({
        key,
        label: val.label,
        type: val.type,
        required: val.required,
      })),
    });
    setEditModal(true);
  };

  const handleSave = async () => {
    if (!current) return;
    const values = form.getFieldsValue();
    const schema: Record<string, any> = {};
    (values.schema || []).forEach((item: any) => {
      schema[item.key] = { label: item.label, type: item.type, required: item.required, options: [] };
    });
    try {
      await api.put(`/api/v1/templates/${current.id}`, { name: values.name, variable_schema: schema });
      message.success('保存成功');
      setEditModal(false);
      fetchTemplates();
    } catch {
      message.error('保存失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '模板名称', dataIndex: 'name' },
    { title: '原始文件名', dataIndex: 'original_filename' },
    {
      title: '变量',
      dataIndex: 'variables',
      render: (vars: string[]) => vars.map(v => <Tag key={v}>{v}</Tag>),
    },
    {
      title: '操作',
      width: 160,
      render: (_: any, record: Template) => (
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
        <Typography.Title level={4} style={{ margin: 0 }}>模板管理</Typography.Title>
        <Upload beforeUpload={handleUpload} accept=".docx" showUploadList={false}>
          <Button type="primary" icon={<UploadOutlined />}>上传模板</Button>
        </Upload>
      </div>

      <Table dataSource={templates} columns={columns} rowKey="id" loading={loading} />

      <Modal
        title="编辑模板"
        open={editModal}
        onOk={handleSave}
        onCancel={() => setEditModal(false)}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Typography.Text strong>变量配置</Typography.Text>
          <Form.List name="schema">
            {(fields) => (
              <div style={{ marginTop: 8 }}>
                {fields.map((field) => (
                  <Space key={field.key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                    <Form.Item name={[field.name, 'key']} noStyle>
                      <Input disabled style={{ width: 140 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'label']} noStyle>
                      <Input placeholder="中文标签" style={{ width: 140 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'type']} noStyle>
                      <Select style={{ width: 100 }}>
                        <Select.Option value="text">文本</Select.Option>
                        <Select.Option value="date">日期</Select.Option>
                        <Select.Option value="number">数字</Select.Option>
                        <Select.Option value="select">下拉</Select.Option>
                      </Select>
                    </Form.Item>
                  </Space>
                ))}
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}
