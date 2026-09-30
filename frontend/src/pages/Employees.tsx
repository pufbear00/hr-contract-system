import { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, DatePicker, Typography, message, Space,
  Tag, Popconfirm, Card, Spin, Descriptions, Checkbox, InputNumber, Upload,
} from 'antd';
import type { UploadFile } from 'antd/es/upload';
import { PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined, DownloadOutlined, UploadOutlined, SearchOutlined, CloudSyncOutlined } from '@ant-design/icons';
import api from '../utils/api';
import dayjs from 'dayjs';

interface Employee {
  id: number;
  name: string;
  employee_type: string;
  id_number: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  position: string | null;
  department: string | null;
  entry_date: string | null;
  status: string;
  data: Record<string, any>;
  created_at: string;
  updated_at: string | null;
}

interface TemplateSetOption {
  id: number;
  name: string;
  employee_type: string;
  scenario: string;
}

interface VariableInfo {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
}

// 员工固定字段 → 模板变量的映射（与后端一致）
const EMPLOYEE_TO_TEMPLATE: Record<string, string> = {
  name: 'employee_name',
  id_number: 'id_number',
  gender: 'gender',
  phone: 'phone',
  address: 'address',
  position: 'position',
  department: 'department',
  entry_date: 'entry_date',
};

// data 中文 key → 模板变量 key 的映射（与后端一致）
const DATA_TO_TEMPLATE_VAR: Record<string, string> = {
  '正式员工月薪': 'salary',
  '实习生日薪': 'daily_pay',
  '租房补贴': 'housing_allowance',
};

function getEmployeeTemplateValues(emp: Employee): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [field, tplVar] of Object.entries(EMPLOYEE_TO_TEMPLATE)) {
    const val = (emp as any)[field];
    if (val != null && val !== '') values[tplVar] = String(val);
  }
  if (emp.data) {
    for (const [k, v] of Object.entries(emp.data)) {
      if (v != null && v !== '') values[k] = String(v);
    }
  }

  // 中文 key → 模板变量 key 翻译
  for (const [dataKey, tplKey] of Object.entries(DATA_TO_TEMPLATE_VAR)) {
    if (!values[tplKey] && values[dataKey]) {
      values[tplKey] = values[dataKey];
    }
  }

  // 学校 + 专业 → school 模板变量
  if (!values['school']) {
    const schoolName = values['school_name'] || '';
    const major = values['major'] || '';
    if (schoolName && major) {
      values['school'] = `${schoolName}--${major}`;
    } else if (schoolName) {
      values['school'] = schoolName;
    }
  } else if (values['major'] && !values['school'].includes('--')) {
    values['school'] = `${values['school']}--${values['major']}`;
  }

  // position → intern_position fallback（实习合同用）
  if (!values['intern_position'] && values['position']) {
    values['intern_position'] = values['position'];
  }

  // 自动推导 base_salary（用于 N+1 补偿计算）
  if (!values['base_salary'] && emp.data) {
    const salary = emp.data['正式员工月薪'] || emp.data['实习生月薪'];
    if (salary) values['base_salary'] = String(salary);
  }
  return values;
}

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();

  // 新增/编辑 Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // 批量导入
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, any>[]>([]);
  const [importing, setImporting] = useState(false);

  // 公司选择
  const [genCompanies, setGenCompanies] = useState<{ id: number; company_name: string; sign_city: string | null; work_city: string | null; is_default: number }[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  // 生成合同 Modal
  const [genModalOpen, setGenModalOpen] = useState(false);
  const [genEmployee, setGenEmployee] = useState<Employee | null>(null);
  const [templateSets, setTemplateSets] = useState<TemplateSetOption[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<number | null>(null);
  const [variables, setVariables] = useState<VariableInfo[]>([]);
  const [loadingVars, setLoadingVars] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ job_id: number; document_count: number } | null>(null);
  const [genForm] = Form.useForm();
  const [saveBack, setSaveBack] = useState(false);
  const [compInfo, setCompInfo] = useState<{
    n: number; n_monthly: number; compensation_n: number;
    compensation_1: number; compensation_amount: number;
    monthly_cap: number | null; wage_year: number | null;
  } | null>(null);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (filterType) params.employee_type = filterType;
      if (filterStatus) params.status = filterStatus;
      const res = await api.get('/api/v1/employees', { params });
      setEmployees(res.data);
    } catch {
      message.error('获取员工列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEmployees(); }, [search, filterType, filterStatus]);

  // === 新增/编辑 ===
  const openEditModal = (emp?: Employee) => {
    setEditingEmployee(emp || null);
    if (emp) {
      editForm.setFieldsValue({
        ...emp,
        entry_date: emp.entry_date ? dayjs(emp.entry_date) : null,
        salary_formal: emp.data?.['正式员工月薪'] ?? null,
        salary_intern_daily: emp.data?.['实习生日薪'] ?? null,
        salary_intern_monthly: emp.data?.['实习生月薪'] ?? null,
        school_name: emp.data?.['school_name'] ?? emp.data?.['school'] ?? null,
        major: emp.data?.['major'] ?? null,
        housing_allowance: emp.data?.['housing_allowance'] ?? emp.data?.['租房补贴'] ?? null,
      });
    } else {
      editForm.resetFields();
      editForm.setFieldsValue({ employee_type: '正式', status: '在职', data: {} });
    }
    setEditModalOpen(true);
  };

  const handleSave = async () => {
    const values = await editForm.validateFields();
    if (values.entry_date && typeof values.entry_date === 'object' && 'format' in values.entry_date) {
      values.entry_date = values.entry_date.format('YYYY-MM-DD');
    }
    // 将扩展字段合并到 data
    const data = { ...(values.data || {}) };
    if (values.salary_formal != null && values.salary_formal !== '') {
      data['正式员工月薪'] = values.salary_formal;
    }
    if (values.salary_intern_daily != null && values.salary_intern_daily !== '') {
      data['实习生日薪'] = values.salary_intern_daily;
    }
    if (values.salary_intern_monthly != null && values.salary_intern_monthly !== '') {
      data['实习生月薪'] = values.salary_intern_monthly;
    }
    if (values.school_name != null && values.school_name !== '') {
      data['school_name'] = values.school_name;
    }
    if (values.major != null && values.major !== '') {
      data['major'] = values.major;
    }
    if (values.housing_allowance != null && values.housing_allowance !== '') {
      data['housing_allowance'] = values.housing_allowance;
    }
    values.data = data;
    delete values.salary_formal;
    delete values.salary_intern_daily;
    delete values.salary_intern_monthly;
    delete values.school_name;
    delete values.major;
    delete values.housing_allowance;

    setSaving(true);
    try {
      if (editingEmployee) {
        await api.put(`/api/v1/employees/${editingEmployee.id}`, values);
        message.success('更新成功');
      } else {
        await api.post('/api/v1/employees', values);
        message.success('创建成功');
      }
      setEditModalOpen(false);
      fetchEmployees();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/v1/employees/${id}`);
      message.success('删除成功');
      fetchEmployees();
    } catch {
      message.error('删除失败');
    }
  };

  // === 批量导入 ===
  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/api/v1/employees/template/download', { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employee_template.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      message.success('模板下载成功');
    } catch {
      message.error('模板下载失败');
    }
  };

  const handleExport = async () => {
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterType) params.employee_type = filterType;
      if (filterStatus) params.status = filterStatus;
      const res = await api.get('/api/v1/employees/export', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employees_export.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    }
  };

  const handleBatchUpload = async (file: UploadFile) => {
    try {
      const formData = new FormData();
      formData.append('file', file as unknown as File);
      const res = await api.post('/api/v1/employees/batch-upload', formData);
      setPreviewHeaders(res.data.headers);
      setPreviewRows(res.data.rows);
      setPreviewOpen(true);
    } catch {
      message.error('文件解析失败');
    }
    return false;
  };

  const handleBatchConfirm = async () => {
    setImporting(true);
    try {
      const res = await api.post('/api/v1/employees/batch', previewRows);
      message.success(`成功导入 ${res.data.length} 条员工记录`);
      setPreviewOpen(false);
      setPreviewRows([]);
      setPreviewHeaders([]);
      fetchEmployees();
    } catch {
      message.error('批量导入失败');
    } finally {
      setImporting(false);
    }
  };

  // === 生成合同 ===
  const openGenModal = async (emp: Employee) => {
    setGenEmployee(emp);
    setSelectedSetId(null);
    setSelectedCompanyId(null);
    setVariables([]);
    setGenResult(null);
    setSaveBack(false);
    genForm.resetFields();
    setGenModalOpen(true);
    try {
      const [setsRes, companiesRes] = await Promise.all([
        api.get('/api/v1/template-sets'),
        api.get('/api/v1/companies'),
      ]);
      setTemplateSets(setsRes.data);
      const comps = companiesRes.data;
      setGenCompanies(comps);
      const defaultComp = comps.find((c: any) => c.is_default);
      if (defaultComp) setSelectedCompanyId(defaultComp.id);
    } catch {
      message.error('获取数据失败');
    }
  };

  // 尝试自动计算 N+1 补偿金额
  const tryCalcCompensation = async (currentVars?: VariableInfo[]) => {
    const vars = currentVars || variables;
    if (!vars.some(v => v.key === 'compensation_amount') || !genEmployee) return;

    const empValues = getEmployeeTemplateValues(genEmployee);
    const formValues = genForm.getFieldValue('values') || {};

    // 从员工档案或表单取值
    let entryDate = empValues['entry_date'] || formValues['entry_date'];
    let termDate = formValues['termination_date'] || empValues['termination_date'];
    const baseSalary = empValues['base_salary'] || formValues['base_salary'];

    // dayjs 对象转字符串
    if (termDate && typeof termDate === 'object' && 'format' in termDate) {
      termDate = termDate.format('YYYY-MM-DD');
    }
    if (entryDate && typeof entryDate === 'object' && 'format' in entryDate) {
      entryDate = entryDate.format('YYYY-MM-DD');
    }

    if (!entryDate || !termDate || !baseSalary) {
      setCompInfo(null);
      return;
    }

    try {
      const compRes = await api.get('/api/v1/social-wages/calc-compensation', {
        params: { entry_date: entryDate, termination_date: termDate, base_salary: baseSalary },
      });
      const comp = compRes.data;
      setCompInfo(comp);
      genForm.setFieldsValue({
        values: { ...formValues, compensation_amount: String(comp.compensation_amount) },
      });
    } catch {
      setCompInfo(null);
    }
  };

  // 表单值变化时，尝试自动计算补偿
  const onGenFormValuesChange = (_: any, allValues: any) => {
    if (!variables.some(v => v.key === 'compensation_amount')) return;
    const vals = allValues?.values || {};
    // 当离职日期变化时触发计算
    if (vals.termination_date) {
      tryCalcCompensation();
    }
  };

  const onSetChange = async (setId: number) => {
    setSelectedSetId(setId);
    setGenResult(null);
    setCompInfo(null);
    genForm.resetFields();
    setLoadingVars(true);
    try {
      const res = await api.get('/api/v1/generate/variables', { params: { template_set_id: setId } });
      const vars: VariableInfo[] = res.data.variables;
      setVariables(vars);
      // 自动预填已有值；日期字段无已有值则默认今天
      if (genEmployee) {
        const empValues = getEmployeeTemplateValues(genEmployee);
        const dateKeys = new Set([
          'termination_date', 'entry_date', 'sign_date',
          'salary_period_start', 'salary_period_end',
          'start_date', 'end_date',
          'contract_start_date', 'contract_end_date', 'probation_end_date',
        ]);
        const formValues: Record<string, any> = {};
        // 从选中公司获取城市默认值
        const selectedComp = genCompanies.find(c => c.id === selectedCompanyId);
        for (const v of vars) {
          const isDate = dateKeys.has(v.key) || v.type === 'date';
          if (AUTO_GENERATED_KEYS.has(v.key)) continue; // 跳过自动生成字段
          if (empValues[v.key]) {
            formValues[v.key] = isDate ? dayjs(empValues[v.key]) : empValues[v.key];
          } else if (v.key === 'sign_city' && selectedComp?.sign_city) {
            formValues[v.key] = selectedComp.sign_city;
          } else if (v.key === 'work_city' && selectedComp?.work_city) {
            formValues[v.key] = selectedComp.work_city;
          } else if (isDate) {
            formValues[v.key] = dayjs(); // 默认今天
          } else if (v.key === 'salary_month') {
            formValues[v.key] = `${dayjs().month() + 1}月`; // 默认当前月
          }
        }
        // 合同日期联动：contract_start_date = entry_date，contract_end_date = entry_date + 3年 - 1天
        const varKeys = new Set(vars.map(v => v.key));
        const entryDate = formValues['entry_date']
          || (genEmployee?.entry_date ? dayjs(genEmployee.entry_date) : null)
          || dayjs();
        if (varKeys.has('contract_start_date')) {
          formValues['contract_start_date'] = entryDate;
        }
        if (varKeys.has('contract_end_date')) {
          formValues['contract_end_date'] = entryDate.add(3, 'year').subtract(1, 'day');
        }
        // 根据场景设置日期默认值
        const currentSet = templateSets.find(s => s.id === setId);
        const isOffboarding = currentSet?.scenario === '离职';
        if (isOffboarding) {
          // 离职：start_date = 入职日，end_date = 今天，sign_date = 今天
          if (varKeys.has('start_date')) {
            formValues['start_date'] = entryDate;
          }
          if (varKeys.has('end_date')) {
            formValues['end_date'] = dayjs();
          }
          if (varKeys.has('sign_date')) {
            formValues['sign_date'] = dayjs();
          }
        } else {
          // 入职：start_date = entry_date，end_date = entry_date + 6个月，sign_date = entry_date
          if (varKeys.has('start_date')) {
            formValues['start_date'] = entryDate;
          }
          if (varKeys.has('end_date')) {
            formValues['end_date'] = entryDate.add(6, 'month');
          }
          if (varKeys.has('sign_date')) {
            formValues['sign_date'] = entryDate;
          }
        }
        // 合同期限默认 3 年
        if (varKeys.has('contract_years')) {
          formValues['contract_years'] = 3;
        }
        // 试用期默认 3 个月
        if (varKeys.has('probation_months')) {
          formValues['probation_months'] = 3;
        }
        genForm.setFieldsValue({ values: formValues });
        // 立即尝试计算补偿（因为日期已有默认值）
        tryCalcCompensation(vars);
      }
    } catch {
      message.error('获取变量失败');
    } finally {
      setLoadingVars(false);
    }
  };

  const handleGenerate = async () => {
    if (!genEmployee || !selectedSetId) return;
    const formData = await genForm.validateFields();
    const empValues = getEmployeeTemplateValues(genEmployee);

    // 找出哪些是 extra（非员工已有的值）
    const allValues: Record<string, string> = {};
    const extraValues: Record<string, string> = {};
    for (const [key, val] of Object.entries(formData.values || {})) {
      let strVal: string;
      if (val && typeof val === 'object' && 'format' in (val as any)) {
        strVal = (val as any).format('YYYY-MM-DD');
      } else {
        strVal = String(val ?? '');
      }
      allValues[key] = strVal;
      if (!empValues[key] || empValues[key] !== strVal) {
        extraValues[key] = strVal;
      }
    }

    setGenerating(true);
    try {
      const res = await api.post(`/api/v1/employees/${genEmployee.id}/generate`, {
        template_set_id: selectedSetId,
        company_id: selectedCompanyId,
        extra_values: extraValues,
        save_back: saveBack,
      });
      setGenResult(res.data);
      message.success('生成成功！');
      if (saveBack) fetchEmployees();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const download = (jobId: number) => {
    const token = localStorage.getItem('token');
    window.open(`/api/v1/generate/download/${jobId}?token=${token}`, '_blank');
  };

  // 后端会自动生成的字段（_en 后缀 + salary_period_end）
  const AUTO_GENERATED_KEYS = new Set(['employee_name_en', 'salary_month_en', 'termination_date_en', 'salary_period_start_en', 'salary_period_end_en', 'salary_period_start', 'salary_period_end', 'company_name', 'company_name_en', 'company_address', 'postal_code']);

  // 字段显示排序
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

  // 应该用 DatePicker 渲染的字段（按 key 名判断）
  const DATE_FIELD_KEYS = new Set([
    'termination_date', 'entry_date', 'sign_date',
    'salary_period_start', 'salary_period_end',
    'start_date', 'end_date',
    'contract_start_date', 'contract_end_date', 'probation_end_date',
  ]);

  const renderGenField = (v: VariableInfo) => {
    if (AUTO_GENERATED_KEYS.has(v.key)) return null;

    const empValues = genEmployee ? getEmployeeTemplateValues(genEmployee) : {};
    const hasValue = !!empValues[v.key];
    const rules = v.required && !AUTO_GENERATED_KEYS.has(v.key) ? [{ required: true, message: `请填写${v.label}` }] : [];
    const label = (
      <span>
        {v.label}
        {hasValue && <Tag color="green" style={{ marginLeft: 6, fontSize: 11 }}>已有</Tag>}
      </span>
    );

    // 补偿金额字段：特殊渲染，显示计算明细
    if (v.key === 'compensation_amount') {
      return (
        <div key={v.key}>
          <Form.Item name={['values', v.key]} label={label} rules={rules}>
            <Input placeholder="填写离职日期后自动计算 N+1" />
          </Form.Item>
          {compInfo && (
            <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: '8px 12px', marginTop: -8, marginBottom: 16, fontSize: 13 }}>
              <strong>N+1 计算明细</strong>（{compInfo.wage_year}年社平数据）
              <div style={{ marginTop: 4 }}>
                N = <strong>{compInfo.n}</strong>（工龄系数）
                {' | '}月薪上限 = <strong>{compInfo.monthly_cap?.toLocaleString()}</strong>
                {' | '}N 部分月薪 = <strong>{compInfo.n_monthly.toLocaleString()}</strong>
              </div>
              <div>
                N 部分 = {compInfo.n} × {compInfo.n_monthly.toLocaleString()} = <strong>{compInfo.compensation_n.toLocaleString()}</strong>
                {' | '}
                +1 部分 = <strong>{compInfo.compensation_1.toLocaleString()}</strong>
              </div>
              <div>
                合计 = <strong style={{ color: '#52c41a', fontSize: 15 }}>{compInfo.compensation_amount.toLocaleString()} 元</strong>
              </div>
            </div>
          )}
        </div>
      );
    }

    // 工资发放月份：1~12 下拉
    if (v.key === 'salary_month') {
      const monthOpts = Array.from({ length: 12 }, (_, i) => ({ value: `${i + 1}月`, label: `${i + 1}月` }));
      return (
        <Form.Item key={v.key} name={['values', v.key]} label={label} rules={rules}>
          <Select options={monthOpts} placeholder="选择月份" />
        </Form.Item>
      );
    }

    // 日期字段统一用 DatePicker
    if (DATE_FIELD_KEYS.has(v.key) || v.type === 'date') {
      const onDateChange = v.key === 'entry_date' ? (val: any) => {
        if (!val) return;
        const cur = genForm.getFieldValue('values') || {};
        const varKeys = new Set(variables.map(x => x.key));
        const updates: Record<string, any> = {};
        if (varKeys.has('contract_start_date')) updates['contract_start_date'] = val;
        if (varKeys.has('contract_end_date')) updates['contract_end_date'] = val.add(3, 'year').subtract(1, 'day');
        if (Object.keys(updates).length) genForm.setFieldsValue({ values: { ...cur, ...updates } });
      } : undefined;
      return (
        <Form.Item key={v.key} name={['values', v.key]} label={label} rules={rules}>
          <DatePicker style={{ width: '100%' }} onChange={onDateChange} />
        </Form.Item>
      );
    }

    switch (v.type) {
      case 'number':
        return (
          <Form.Item key={v.key} name={['values', v.key]} label={label} rules={rules}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        );
      case 'select':
        return (
          <Form.Item key={v.key} name={['values', v.key]} label={label} rules={rules}>
            <Select>
              {v.options.map(o => <Select.Option key={o} value={o}>{o}</Select.Option>)}
            </Select>
          </Form.Item>
        );
      default:
        return (
          <Form.Item key={v.key} name={['values', v.key]} label={label} rules={rules}>
            <Input />
          </Form.Item>
        );
    }
  };

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
    {
      title: '类型', dataIndex: 'employee_type', key: 'employee_type', width: 100,
      render: (t: string) => <Tag color={t === '正式' ? 'blue' : 'orange'}>{t}</Tag>,
    },
    { title: '职位', dataIndex: 'position', key: 'position', width: 120 },
    { title: '部门', dataIndex: 'department', key: 'department', width: 120 },
    { title: '入职日期', dataIndex: 'entry_date', key: 'entry_date', width: 120 },
    {
      title: '学校', key: 'school', width: 120, ellipsis: true,
      render: (_: any, record: Employee) =>
        record.data?.['school_name'] || record.data?.['school'] || '-',
    },
    {
      title: '专业', key: 'major', width: 100, ellipsis: true,
      render: (_: any, record: Employee) => record.data?.['major'] || '-',
    },
    {
      title: '月薪', key: 'salary', width: 90,
      render: (_: any, record: Employee) => {
        const salary = record.data?.['正式员工月薪'] || record.data?.['实习生月薪'];
        return salary ? Number(salary).toLocaleString() : '-';
      },
    },
    {
      title: '日薪', key: 'daily_pay', width: 80,
      render: (_: any, record: Employee) => {
        const val = record.data?.['实习生日薪'];
        return val ? Number(val).toLocaleString() : '-';
      },
    },
    {
      title: '租房补贴', key: 'housing', width: 90,
      render: (_: any, record: Employee) => {
        const val = record.data?.['housing_allowance'] || record.data?.['租房补贴'];
        return val ? Number(val).toLocaleString() : '-';
      },
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (s: string) => <Tag color={s === '在职' ? 'green' : 'default'}>{s}</Tag>,
    },
    {
      title: '操作', key: 'action', width: 220,
      render: (_: any, record: Employee) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>编辑</Button>
          <Button size="small" type="primary" icon={<FileTextOutlined />} onClick={() => openGenModal(record)}>生成合同</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>员工档案</Typography.Title>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索姓名/手机/身份证"
            allowClear
            style={{ width: 250 }}
            onSearch={setSearch}
            prefix={<SearchOutlined />}
          />
          <Select
            placeholder="员工类型"
            allowClear
            style={{ width: 130 }}
            onChange={setFilterType}
            value={filterType}
          >
            <Select.Option value="正式">正式</Select.Option>
            <Select.Option value="实习">实习</Select.Option>
            <Select.Option value="劳务">劳务</Select.Option>
            <Select.Option value="外包">外包</Select.Option>
            <Select.Option value="顾问">顾问</Select.Option>
          </Select>
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 100 }}
            onChange={setFilterStatus}
            value={filterStatus}
          >
            <Select.Option value="在职">在职</Select.Option>
            <Select.Option value="已离职">已离职</Select.Option>
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditModal()}>
            新增员工
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            批量导出
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
            下载模板
          </Button>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={handleBatchUpload}>
            <Button icon={<UploadOutlined />}>批量导入</Button>
          </Upload>
          <Button icon={<CloudSyncOutlined />} disabled>飞书同步（离线版已禁用）</Button>
        </Space>
      </Card>

      <Table
        columns={columns}
        dataSource={employees}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
      />

      {/* 新增/编辑 Modal */}
      <Modal
        title={editingEmployee ? '编辑员工' : '新增员工'}
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={600}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="employee_type" label="员工类型" rules={[{ required: true }]}>
              <Select style={{ width: 150 }}>
                <Select.Option value="正式">正式</Select.Option>
                <Select.Option value="实习">实习</Select.Option>
                <Select.Option value="劳务">劳务</Select.Option>
                <Select.Option value="外包">外包</Select.Option>
                <Select.Option value="顾问">顾问</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="gender" label="性别">
              <Select style={{ width: 100 }} allowClear>
                <Select.Option value="男">男</Select.Option>
                <Select.Option value="女">女</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select style={{ width: 120 }}>
                <Select.Option value="在职">在职</Select.Option>
                <Select.Option value="已离职">已离职</Select.Option>
              </Select>
            </Form.Item>
          </Space>
          <Form.Item name="id_number" label="身份证号">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="手机">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="地址">
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="position" label="职位">
              <Input />
            </Form.Item>
            <Form.Item name="department" label="部门">
              <Input />
            </Form.Item>
          </Space>
          <Form.Item name="entry_date" label="入职日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="school_name" label="学校">
              <Input style={{ width: 200 }} placeholder="如：浙江大学" />
            </Form.Item>
            <Form.Item name="major" label="专业">
              <Input style={{ width: 200 }} placeholder="如：计算机科学" />
            </Form.Item>
          </Space>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.employee_type !== cur.employee_type}>
            {({ getFieldValue }) => {
              const type = getFieldValue('employee_type');
              if (type === '实习') {
                return (
                  <>
                    <Space style={{ width: '100%' }} size="large">
                      <Form.Item name="salary_intern_daily" label="实习生日薪（元）">
                        <InputNumber style={{ width: 180 }} min={0} precision={0} />
                      </Form.Item>
                      <Form.Item name="salary_intern_monthly" label="实习生月薪（元）">
                        <InputNumber style={{ width: 180 }} min={0} precision={0} />
                      </Form.Item>
                    </Space>
                    <Form.Item name="housing_allowance" label="租房补贴（元/月）">
                      <InputNumber style={{ width: 200 }} min={0} precision={0} />
                    </Form.Item>
                  </>
                );
              }
              return (
                <Form.Item name="salary_formal" label="月薪（元）">
                  <InputNumber style={{ width: 200 }} min={0} precision={0} />
                </Form.Item>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* 生成合同 Modal */}
      <Modal
        title={genEmployee ? `为 ${genEmployee.name} 生成合同` : '生成合同'}
        open={genModalOpen}
        onCancel={() => { setGenModalOpen(false); setGenResult(null); }}
        footer={genResult ? [
          <Button key="download" type="primary" icon={<DownloadOutlined />} onClick={() => download(genResult.job_id)}>
            下载 ZIP ({genResult.document_count} 份文档)
          </Button>,
          <Button key="close" onClick={() => { setGenModalOpen(false); setGenResult(null); }}>关闭</Button>,
        ] : undefined}
        onOk={handleGenerate}
        confirmLoading={generating}
        okText="生成合同"
        width={700}
        destroyOnClose
      >
        {!genResult ? (
          <>
            <Form.Item label="选择签约公司" style={{ marginBottom: 16 }}>
              <Select
                placeholder="选择签约公司"
                style={{ width: '100%' }}
                value={selectedCompanyId}
                onChange={(id) => {
                  setSelectedCompanyId(id);
                  const comp = genCompanies.find(c => c.id === id);
                  if (comp) {
                    const cur = genForm.getFieldValue('values') || {};
                    genForm.setFieldsValue({ values: {
                      ...cur,
                      ...(comp.sign_city ? { sign_city: comp.sign_city } : {}),
                      ...(comp.work_city ? { work_city: comp.work_city } : {}),
                    }});
                  }
                }}
                allowClear
              >
                {genCompanies.map(c => (
                  <Select.Option key={c.id} value={c.id}>
                    {c.company_name}{c.is_default ? '（默认）' : ''}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="选择模板集合" style={{ marginBottom: 16 }}>
              <Select
                placeholder="选择员工类型+场景"
                style={{ width: '100%' }}
                onChange={onSetChange}
                value={selectedSetId}
              >
                {templateSets.map(s => (
                  <Select.Option key={s.id} value={s.id}>
                    {s.name} ({s.employee_type} - {s.scenario})
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            {loadingVars && <Spin tip="加载变量中..." />}

            {variables.length > 0 && !loadingVars && (
              <>
                {genEmployee && (
                  <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
                    <Descriptions.Item label="姓名">{genEmployee.name}</Descriptions.Item>
                    <Descriptions.Item label="类型">{genEmployee.employee_type}</Descriptions.Item>
                    <Descriptions.Item label="身份证">{genEmployee.id_number || '-'}</Descriptions.Item>
                    <Descriptions.Item label="手机">{genEmployee.phone || '-'}</Descriptions.Item>
                  </Descriptions>
                )}
                <Form form={genForm} layout="vertical" style={{ maxHeight: 400, overflowY: 'auto' }} onValuesChange={onGenFormValuesChange}>
                  {sortVariables(variables).map(renderGenField)}
                </Form>
                <Checkbox
                  checked={saveBack}
                  onChange={e => setSaveBack(e.target.checked)}
                  style={{ marginTop: 8 }}
                >
                  将新填入的字段保存回员工档案
                </Checkbox>
              </>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Typography.Title level={4} type="success">生成成功！</Typography.Title>
            <Typography.Text>共生成 {genResult.document_count} 份文档</Typography.Text>
          </div>
        )}
      </Modal>

      {/* 批量导入预览 Modal */}
      <Modal
        title={`批量导入预览（共 ${previewRows.length} 条）`}
        open={previewOpen}
        onOk={handleBatchConfirm}
        onCancel={() => { setPreviewOpen(false); setPreviewRows([]); setPreviewHeaders([]); }}
        okText="确认导入"
        cancelText="取消"
        confirmLoading={importing}
        width={960}
      >
        <Table
          rowKey={(_: any, i: any) => String(i)}
          dataSource={previewRows}
          columns={previewHeaders.map(h => ({ title: h, dataIndex: h, key: h, ellipsis: true }))}
          size="small"
          pagination={false}
          scroll={{ x: true, y: 400 }}
        />
      </Modal>
    </div>
  );
}
