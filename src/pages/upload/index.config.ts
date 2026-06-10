export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '上传照片' })
  : { navigationBarTitleText: '上传照片' }