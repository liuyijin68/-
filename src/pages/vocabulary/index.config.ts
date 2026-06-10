export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '词库管理' })
  : { navigationBarTitleText: '词库管理' }