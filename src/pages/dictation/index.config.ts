export default typeof definePageConfig === 'function'
  ? definePageConfig({
      navigationBarTitleText: '单词听写'
    })
  : {
      navigationBarTitleText: '单词听写'
    }