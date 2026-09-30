import { useState, useEffect } from 'react';
import { Select, Upload, Button, Table, Card, Typography, message, Space, Result } from 'antd';
import { UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import api from '../utils/api';

interface TemplateSetOption {
  id: number;
  name: string;
  employee_type: string;
  scenario: string;
}

interface PreviewRow {
  row_number: number;
  employee_name: string;
  values: Record<string, string>;
}

interface CompanyOption {
  id: number;
  company_name: string;
  is_default: number;
}

export default function BatchGenerate() {
  const [sets, setSets] = useState<TemplateSetOption[]>([]);
  const [selectedSet, setSelectedSet] = useState<number | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ columns: string[]; rows: PreviewRow[] } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ job_id: number; employee_count: number; document_count: number } | null>(null);

  useEffect(() => {
    api.get('/api/v1/template-sets').then(res => setSets(res.data));
    api.get('/api/v1/companies').then(res => {
      const comps = res.data;
      setCompanies(comps);
      const defaultComp = comps.find((c: CompanyOption) => c.is_default);
      if (defaultComp) setSelectedCompanyId(defaultComp.id);
    });
  }, []);

  const handleUpload = async (file: File) => {
    if (!selectedSet) {
      message.warning('请先选择模板集合');
      return false;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('template_set_id', String(selectedSet));
    try {
      const res = await api.post('/api/v1/generate/batch-upload', formData);
      setPreview({ columns: res.data.columns, rows: res.data.rows });
      setResult(null);
      message.success(`解析成功，共 ${res.data.total} 条记录`);
    } catch (e: any) {
      message.error(e.response?.data?.detail || '解析失败');
    }
    return false;
  };

  const handleGenerate = async () => {
    if (!selectedSet || !preview) return;
    setGenerating(true);
    try {
      const res = await api.post('/api/v1/generate/batch', {
        template_set_id: selectedSet,
        company_id: selectedCompanyId,
        rows: preview.rows.map(r => r.values),
      });
      setResult(res.data);
      message.success('批量生成成功！');
    } catch (e: any) {
      message.error(e.response?.data?.detail || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const download = (jobId: number) => {
    const token = localStorage.getItem('token');
    window.open(
      `/api/v1/generate/download/${jobId}?token=${token}`,
      '_blank'
    );
  };

  const previewColumns = preview
    ? [
        { title: '序号', dataIndex: 'row_number', width: 60 },
        { title: '姓名', dataIndex: 'employee_name', width: 100 },
        ...preview.columns.slice(0, 6).map(col => ({
          title: col,
          dataIndex: ['values', col],
          render: (_: any, record: PreviewRow) => record.values[col] || '-',
        })),
      ]
    : [];

  return (
    <div>
      <Typography.Title level={4}>批量生成</Typography.Title>

      <Card style={{ marginBottom: 16 }}>
        <Space size="large" wrap>
          <div>
            <Typography.Text>选择签约公司：</Typography.Text>
            <Select
              placeholder="选择签约公司"
              style={{ width: 280 }}
              value={selectedCompanyId}
              onChange={setSelectedCompanyId}
              allowClear
            >
              {companies.map(c => (
                <Select.Option key={c.id} value={c.id}>
                  {c.company_name}{c.is_default ? '（默认）' : ''}
                </Select.Option>
              ))}
            </Select>
          </div>
          <div>
            <Typography.Text>选择模板集合：</Typography.Text>
            <Select
              placeholder="选择员工类型+场景"
              style={{ width: 280 }}
              onChange={setSelectedSet}
              value={selectedSet}
            >
              {sets.map(s => (
                <Select.Option key={s.id} value={s.id}>
                  {s.name} ({s.employee_type} - {s.scenario})
                </Select.Option>
              ))}
            </Select>
          </div>
          <Upload beforeUpload={handleUpload} accept=".xlsx,.xls" showUploadList={false}>
            <Button icon={<UploadOutlined />} disabled={!selectedSet}>
              上传 Excel 花名册
            </Button>
          </Upload>
        </Space>
      </Card>

      {preview && (
        <Card title={`预览数据（共 ${preview.rows.length} 人）`} style={{ marginBottom: 16 }}>
          <Table
            dataSource={preview.rows}
            columns={previewColumns}
            rowKey="row_number"
            size="small"
            pagination={{ pageSize: 10 }}
          />
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button type="primary" onClick={handleGenerate} loading={generating} size="large">
              确认批量生成
            </Button>
          </div>
        </Card>
      )}

      {result && (
        <Result
          status="success"
          title="批量生成成功"
          subTitle={`共 ${result.employee_count} 人，${result.document_count} 份文档`}
          extra={
            <Button type="primary" icon={<DownloadOutlined />} onClick={() => download(result.job_id)}>
              下载 ZIP
            </Button>
          }
        />
      )}
    </div>
  );
}
