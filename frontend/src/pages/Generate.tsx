import { useState, useEffect } from 'react';
import { Form, Select, Input, InputNumber, DatePicker, Button, Card, Typography, message, Space, Spin, Result } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import api from '../utils/api';
import dayjs from 'dayjs';

interface VariableInfo {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
}

interface TemplateSetOption {
  id: number;
  name: string;
  employee_type: string;
  scenario: string;
}

const AUTO_GENERATED_KEYS = new Set(['employee_name_en', 'salary_month_en', 'termination_date_en', 'salary_period_start_en', 'salary_period_end_en', 'salary_period_start', 'salary_period_end', 'company_name', 'company_name_en', 'company_address', 'postal_code']);

const DATE_FIELD_KEYS = new Set([
  'termination_date', 'entry_date', 'sign_date',
  'salary_period_start', 'salary_period_end',
  'start_date', 'end_date',
  'contract_start_date', 'contract_end_date', 'probation_end_date',
]);

const FIELD_ORDER: Record<string, number> = {
  employee_name: 1, id_number: 2, phone: 3, gender: 4, address: 5,
  position: 6, department: 7, school: 8, intern_position: 9,
  contract_start_date: 10, contract_end_date: 11, contract_years: 12,
  probation_months: 13, probation_end_date: 14,
  start_date: 15, end_date: 16,
  entry_date: 17, termination_date: 18,
  salary: 20, daily_pay: 21, housing_allowance: 22,
  salary_month: 23, compensation_amount: 24,
  sign_city: 30, work_city: 31, sign_date: 32,
};
const sortVariables = (vars: VariableInfo[]) =>
  [...vars].sort((a, b) => (FIELD_ORDER[a.key] ?? 99) - (FIELD_ORDER[b.key] ?? 99));

interface CompanyOption {
  id: number;
  company_name: string;
  sign_city: string | null;
  work_city: string | null;
  is_default: number;
}

export default function Generate() {
  const [sets, setSets] = useState<TemplateSetOption[]>([]);
  const [selectedSet, setSelectedSet] = useState<number | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [variables, setVariables] = useState<VariableInfo[]>([]);
  const [loadingVars, setLoadingVars] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ job_id: number; document_count: number } | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    api.get('/api/v1/template-sets').then(res => setSets(res.data));
    api.get('/api/v1/companies').then(res => {
      const comps = res.data;
      setCompanies(comps);
      const defaultComp = comps.find((c: CompanyOption) => c.is_default);
      if (defaultComp) setSelectedCompanyId(defaultComp.id);
    });
  }, []);

  const onCompanyChange = (id: number) => {
    setSelectedCompanyId(id);
    const comp = companies.find(c => c.id === id);
    if (comp) {
      const cur = form.getFieldValue('values') || {};
      form.setFieldsValue({ values: {
        ...cur,
        ...(comp.sign_city ? { sign_city: comp.sign_city } : {}),
        ...(comp.work_city ? { work_city: comp.work_city } : {}),
      }});
    }
  };

  const onSetChange = async (setId: number) => {
    setSelectedSet(setId);
    setResult(null);
    setLoadingVars(true);
    form.resetFields(['values']);
    try {
      const res = await api.get('/api/v1/generate/variables', { params: { template_set_id: setId } });
      const vars: VariableInfo[] = res.data.variables;
      setVariables(vars);
      // 自动填充默认值
      const selectedComp = companies.find(c => c.id === selectedCompanyId);
      const formValues: Record<string, any> = {};
      const today = dayjs();
      for (const v of vars) {
        if (AUTO_GENERATED_KEYS.has(v.key)) continue;
        if (v.key === 'sign_city' && selectedComp?.sign_city) {
          formValues[v.key] = selectedComp.sign_city;
        } else if (v.key === 'work_city' && selectedComp?.work_city) {
          formValues[v.key] = selectedComp.work_city;
        } else if (DATE_FIELD_KEYS.has(v.key) || v.type === 'date') {
          formValues[v.key] = today;
        } else if (v.key === 'salary_month') {
          formValues[v.key] = `${today.month() + 1}月`;
        }
      }
      // 合同日期联动：contract_start_date = entry_date，contract_end_date = entry_date + 3年 - 1天
      const varKeys = new Set(vars.map(v => v.key));
      const entryDate = formValues['entry_date'] || today;
      if (varKeys.has('contract_start_date')) {
        formValues['contract_start_date'] = entryDate;
      }
      if (varKeys.has('contract_end_date')) {
        formValues['contract_end_date'] = entryDate.add(3, 'year').subtract(1, 'day');
      }
      if (varKeys.has('contract_years')) {
        formValues['contract_years'] = 3;
      }
      if (varKeys.has('probation_months')) {
        formValues['probation_months'] = 3;
      }
      form.setFieldsValue({ values: formValues });
    } catch {
      message.error('获取变量失败');
    } finally {
      setLoadingVars(false);
    }
  };

  const onGenerate = async () => {
    const values = await form.validateFields();
    const flatValues: Record<string, string> = {};
    for (const [key, val] of Object.entries(values.values || {})) {
      if (val && typeof val === 'object' && 'format' in (val as any)) {
        flatValues[key] = (val as any).format('YYYY-MM-DD');
      } else {
        flatValues[key] = String(val ?? '');
      }
    }

    setGenerating(true);
    try {
      const res = await api.post('/api/v1/generate/single', {
        template_set_id: selectedSet,
        company_id: selectedCompanyId,
        values: flatValues,
      });
      setResult(res.data);
      message.success('生成成功！');
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

  const renderField = (v: VariableInfo) => {
    if (AUTO_GENERATED_KEYS.has(v.key)) return null;
    const rules = v.required ? [{ required: true, message: `请填写${v.label}` }] : [];

    // 工资发放月份：1~12 下拉
    if (v.key === 'salary_month') {
      const monthOpts = Array.from({ length: 12 }, (_, i) => ({ value: `${i + 1}月`, label: `${i + 1}月` }));
      return (
        <Form.Item key={v.key} name={['values', v.key]} label={v.label} rules={rules}>
          <Select options={monthOpts} placeholder="选择月份" />
        </Form.Item>
      );
    }

    // 日期字段统一用 DatePicker
    if (DATE_FIELD_KEYS.has(v.key) || v.type === 'date') {
      const onDateChange = v.key === 'entry_date' ? (val: any) => {
        if (!val) return;
        const cur = form.getFieldValue('values') || {};
        const varKeys = new Set(variables.map(x => x.key));
        const updates: Record<string, any> = {};
        if (varKeys.has('contract_start_date')) updates['contract_start_date'] = val;
        if (varKeys.has('contract_end_date')) updates['contract_end_date'] = val.add(3, 'year').subtract(1, 'day');
        if (Object.keys(updates).length) form.setFieldsValue({ values: { ...cur, ...updates } });
      } : undefined;
      return (
        <Form.Item key={v.key} name={['values', v.key]} label={v.label} rules={rules}>
          <DatePicker style={{ width: '100%' }} onChange={onDateChange} />
        </Form.Item>
      );
    }

    switch (v.type) {
      case 'number':
        return (
          <Form.Item key={v.key} name={['values', v.key]} label={v.label} rules={rules}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        );
      case 'select':
        return (
          <Form.Item key={v.key} name={['values', v.key]} label={v.label} rules={rules}>
            <Select>
              {v.options.map(o => <Select.Option key={o} value={o}>{o}</Select.Option>)}
            </Select>
          </Form.Item>
        );
      default:
        return (
          <Form.Item key={v.key} name={['values', v.key]} label={v.label} rules={rules}>
            <Input />
          </Form.Item>
        );
    }
  };

  return (
    <div>
      <Typography.Title level={4}>生成合同</Typography.Title>

      <Card style={{ marginBottom: 16 }}>
        <Space size="large" wrap>
          <Form.Item label="选择签约公司" style={{ marginBottom: 0 }}>
            <Select
              placeholder="选择签约公司"
              style={{ width: 280 }}
              value={selectedCompanyId}
              onChange={onCompanyChange}
              allowClear
            >
              {companies.map(c => (
                <Select.Option key={c.id} value={c.id}>
                  {c.company_name}{c.is_default ? '（默认）' : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="选择模板集合" style={{ marginBottom: 0 }}>
            <Select
              placeholder="选择员工类型+场景"
              style={{ width: 300 }}
              onChange={onSetChange}
              value={selectedSet}
            >
              {sets.map(s => (
                <Select.Option key={s.id} value={s.id}>
                  {s.name} ({s.employee_type} - {s.scenario})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Space>
      </Card>

      {loadingVars && <Spin tip="加载变量中..." />}

      {variables.length > 0 && !loadingVars && (
        <Card title="填写员工信息">
          <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
            {sortVariables(variables).map(renderField)}
            <Form.Item>
              <Space>
                <Button type="primary" onClick={onGenerate} loading={generating}>
                  生成合同
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      )}

      {result && (
        <Result
          status="success"
          title="合同生成成功"
          subTitle={`共生成 ${result.document_count} 份文档`}
          extra={
            <Button type="primary" icon={<DownloadOutlined />} onClick={() => download(result.job_id)}>
              下载 ZIP
            </Button>
          }
          style={{ marginTop: 16 }}
        />
      )}
    </div>
  );
}
