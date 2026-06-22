export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '个人中心' })
  : { navigationBarTitleText: '个人中心' }
