/**
 * 微信小程序隐私授权工具
 * 在使用隐私接口前调用，确保用户已授权
 */

/**
 * 请求隐私授权
 * 调用 wx.requirePrivacyAuthorize 请求用户授权
 * 若用户已授权或非微信环境，直接返回成功
 */
export async function requestPrivacyAuthorize(): Promise<boolean> {
  try {
    // 非微信环境或低版本基础库，直接放行
    if (typeof wx === 'undefined' || !wx.requirePrivacyAuthorize) {
      return true
    }
    await wx.requirePrivacyAuthorize({
      success: () => {},
      fail: () => {},
    })
    console.log('[隐私授权] 成功')
    return true
  } catch (err: any) {
    console.error('[隐私授权] 失败:', err)
    return false
  }
}

/**
 * 请求相册/相机授权（用于 chooseImage）
 */
export async function requestImageAuthorize(): Promise<boolean> {
  const authorized = await requestPrivacyAuthorize()
  if (!authorized) return false

  try {
    await wx.authorize({ scope: 'scope.camera' })
    return true
  } catch {
    // 用户拒绝授权，尝试引导打开设置
    try {
      await wx.showModal({
        title: '需要相机权限',
        content: '请允许使用相机拍摄单词照片',
        confirmText: '去设置',
      })
      await wx.openSetting()
    } catch {}
    return false
  }
}

/**
 * 请求录音授权（用于 RecorderManager）
 */
export async function requestRecordAuthorize(): Promise<boolean> {
  const authorized = await requestPrivacyAuthorize()
  if (!authorized) return false

  try {
    await wx.authorize({ scope: 'scope.record' })
    return true
  } catch {
    // 用户拒绝授权
    try {
      await wx.showModal({
        title: '需要录音权限',
        content: '请允许使用麦克风录制语音',
        confirmText: '去设置',
      })
      await wx.openSetting()
    } catch {}
    return false
  }
}