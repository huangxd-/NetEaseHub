import { _electron as electron, expect, test } from '@playwright/test'

test('launches the desktop shell and navigates core pages', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NETEASEHUB_E2E: '1',
      NETEASEHUB_E2E_USER_DATA: `neteasehub-shell-${process.pid}-${Date.now()}`
    }
  })
  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await expect(window).toHaveTitle('NetEaseHub')
    const accept = window.getByRole('button', { name: '我已了解并继续' })
    await expect(accept).toBeVisible()
    await accept.click()
    await expect(accept).toBeHidden()
    await expect(window.getByText('找到正确的版本')).toBeVisible()
    await expect(
      window.getByPlaceholder('搜索歌曲、歌手或专辑，例如：周杰伦 夜曲')
    ).toBeVisible()

    await window.getByRole('button', { name: /设置/ }).last().click()
    await expect(
      window.getByRole('heading', { name: /洛雪兼容音源/ })
    ).toBeVisible()
    await expect(window.getByText('网易云账号')).toBeVisible()

    await window.getByRole('button', { name: /云盘管理/ }).click()
    await expect(window.getByText('登录后管理网易云云盘')).toBeVisible()
  } finally {
    await app.close()
  }
})
