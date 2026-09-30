import { useState, useEffect } from 'react';
import { Card, Button, Typography, message, Upload, Radio, Row, Col, Statistic, Table, Spin } from 'antd';
import { DownloadOutlined, UploadOutlined, InboxOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import api from '../utils/api';

const { Dragger } = Upload;

interface Stats {
  employees: number;
  companies: number;
  contract_templates: number;
  template_sets: number;
  template_set_items: number;
  social_average_wages: number;
}

interface ImportReportItem {
  created: number;
  skipped: number;
  updated: number;
}

const TABLE_LABELS: Record<string, string> = {
  companies: '公司',
  employees: '员工',
  social_average_wages: '社平工资',
  contract_templates: '合同模板',
  template_sets: '模板集合',
  template_set_items: '集合项目',
};

export default function DataManagement() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [strategy, setStrategy] = useState<'skip' | 'update'>('skip');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [report, setReport] = useState<Record<string, ImportReportItem> | null>(null);

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = await api.get('/api/v1/data/stats');
      setStats(res.data);
    } catch {
      message.error('获取统计信息失败');
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get('/api/v1/data/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const disposition = res.headers['content-disposition'];
      const filename = disposition?.match(/filename="?(.+?)"?$/)?.[1] || 'hr-export.zip';
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (!uploadFile) {
      message.warning('请先选择 ZIP 文件');
      return;
    }
    setImporting(true);
    setReport(null);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const res = await api.post(`/api/v1/data/import?strategy=${strategy}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setReport(res.data.report);
      message.success('导入成功');
      fetchStats();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const uploadProps: UploadProps = {
    accept: '.zip',
    maxCount: 1,
    beforeUpload: (file) => {
      setUploadFile(file);
      setReport(null);
      return false;
    },
    onRemove: () => {
      setUploadFile(null);
      setReport(null);
    },
  };

  const reportColumns = [
    { title: '数据表', dataIndex: 'table', key: 'table' },
    { title: '新增', dataIndex: 'created', key: 'created' },
    { title: '跳过', dataIndex: 'skipped', key: 'skipped' },
    { title: '更新', dataIndex: 'updated', key: 'updated' },
  ];

  const reportData = report
    ? Object.entries(report).map(([key, val]) => ({
        key,
        table: TABLE_LABELS[key] || key,
        ...val,
      }))
    : [];

  return (
    <div>
      <Typography.Title level={4}>数据管理</Typography.Title>
      <Row gutter={24}>
        <Col span={12}>
          <Card title="数据概览" style={{ marginBottom: 16 }}>
            {loadingStats ? (
              <Spin />
            ) : stats ? (
              <Row gutter={[16, 16]}>
                <Col span={8}><Statistic title="员工" value={stats.employees} /></Col>
                <Col span={8}><Statistic title="公司" value={stats.companies} /></Col>
                <Col span={8}><Statistic title="合同模板" value={stats.contract_templates} /></Col>
                <Col span={8}><Statistic title="模板集合" value={stats.template_sets} /></Col>
                <Col span={8}><Statistic title="集合项目" value={stats.template_set_items} /></Col>
                <Col span={8}><Statistic title="社平工资" value={stats.social_average_wages} /></Col>
              </Row>
            ) : null}
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleExport}
              loading={exporting}
              style={{ marginTop: 24 }}
              block
              size="large"
            >
              一键导出全部数据
            </Button>
          </Card>
        </Col>

        <Col span={12}>
          <Card title="导入数据（离线版已禁用）" style={{ marginBottom: 16 }}>
            <Typography.Paragraph type="warning">为防止导入原系统真实资料，空数据版不支持备份恢复。请通过员工、公司、模板页面手动创建虚构演示记录。</Typography.Paragraph>
            <Dragger {...uploadProps} disabled style={{ marginBottom: 16 }}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">点击或拖拽 ZIP 文件到此处</p>
              <p className="ant-upload-hint">支持从"一键导出"生成的 ZIP 文件</p>
            </Dragger>

            <div style={{ marginBottom: 16 }}>
              <Typography.Text strong>重复数据策略：</Typography.Text>
              <Radio.Group
                disabled
                value={strategy}
                onChange={e => setStrategy(e.target.value)}
                style={{ marginLeft: 12 }}
              >
                <Radio value="skip">跳过已存在</Radio>
                <Radio value="update">覆盖更新</Radio>
              </Radio.Group>
            </div>

            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={handleImport}
              loading={importing}
              disabled
              block
              size="large"
            >
              开始导入
            </Button>
          </Card>
        </Col>
      </Row>

      {report && (
        <Card title="导入结果" style={{ marginTop: 16 }}>
          <Table
            columns={reportColumns}
            dataSource={reportData}
            pagination={false}
            size="small"
          />
        </Card>
      )}
    </div>
  );
}
