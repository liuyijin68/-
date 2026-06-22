export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '积分管理' })
  : { navigationBarTitleText: '积分管理' }
