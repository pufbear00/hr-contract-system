import { useState, useEffect } from 'react';
import { Table, Button, Tag, Typography, message } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../utils/api';

interface Job {
  id: number;
  job_type: string;
  status: string;
  employee_type: string | null;
  scenario: string | null;
  employee_count: number;
  document_count: number;
  error_message: string | null;
  created_by_name: string;
  created_at: string;
}

export default function History() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/v1/generate/jobs');
      setJobs(res.data);
    } catch {
      message.error('获取记录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const download = (jobId: number) => {
    const token = localStorage.getItem('token');
    window.open(
      `/api/v1/generate/download/${jobId}?token=${token}`,
      '_blank'
    );
  };

  const statusMap: Record<string, { color: string; text: string }> = {
    completed: { color: 'green', text: '已完成' },
    processing: { color: 'blue', text: '处理中' },
    failed: { color: 'red', text: '失败' },
    pending: { color: 'orange', text: '等待中' },
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '类型',
      dataIndex: 'job_type',
      width: 80,
      render: (v: string) => v === 'batch' ? '批量' : '单人',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (v: string) => {
        const s = statusMap[v] || { color: 'default', text: v };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    { title: '员工类型', dataIndex: 'employee_type', width: 100 },
    { title: '场景', dataIndex: 'scenario', width: 80 },
    { title: '人数', dataIndex: 'employee_count', width: 60 },
    { title: '文档数', dataIndex: 'document_count', width: 70 },
    { title: '操作人', dataIndex: 'created_by_name', width: 80 },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 170,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      width: 100,
      render: (_: any, record: Job) =>
        record.status === 'completed' ? (
          <Button size="small" icon={<DownloadOutlined />} onClick={() => download(record.id)}>
            下载
          </Button>
        ) : record.error_message ? (
          <Typography.Text type="danger" style={{ fontSize: 12 }}>{record.error_message}</Typography.Text>
        ) : null,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>生成记录</Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={fetch}>刷新</Button>
      </div>
      <Table dataSource={jobs} columns={columns} rowKey="id" loading={loading} />
    </div>
  );
}
