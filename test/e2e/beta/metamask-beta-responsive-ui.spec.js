const path = require('path')
const assert = require('assert')
const webdriver = require('selenium-webdriver')
const { By, until } = webdriver
const {
  delay,
  buildChromeWebDriver,
  buildFirefoxWebdriver,
  installWebExt,
  getExtensionIdChrome,
  getExtensionIdFirefox,
} = require('../func')
const {
  checkBrowserForConsoleErrors,
  closeAllWindowHandlesExcept,
  findElement,
  findElements,
  loadExtension,
  verboseReportOnFailure,
} = require('./helpers')

describe('MetaMask', function () {
  let extensionId
  let driver

  const testSeedPhrase = 'phrase upgrade clock rough situate wedding elder clever doctor stamp excess tent'
  const tinyDelayMs = 200
  const regularDelayMs = tinyDelayMs * 2
  const largeDelayMs = regularDelayMs * 2

  this.timeout(0)
  this.bail(true)

  before(async function () {
    let extensionUrl
    switch (process.env.SELENIUM_BROWSER) {
      case 'chrome': {
        const extPath = path.resolve('dist/chrome')
        driver = buildChromeWebDriver(extPath, { responsive: true })
        extensionId = await getExtensionIdChrome(driver)
        await delay(largeDelayMs)
        extensionUrl = `chrome-extension://${extensionId}/home.html`
        break
      }
      case 'firefox': {
        const extPath = path.resolve('dist/firefox')
        driver = buildFirefoxWebdriver({ responsive: true })
        await installWebExt(driver, extPath)
        await delay(largeDelayMs)
        extensionId = await getExtensionIdFirefox(driver)
        extensionUrl = `moz-extension://${extensionId}/home.html`
        break
      }
    }
    // Depending on the state of the application built into the above directory (extPath) and the value of
    // METAMASK_DEBUG we will see different post-install behaviour and possibly some extra windows. Here we
    // are closing any extraneous windows to reset us to a single window before continuing.
    const [tab1] = await driver.getAllWindowHandles()
    await closeAllWindowHandlesExcept(driver, [tab1])
    await driver.switchTo().window(tab1)
    await driver.get(extensionUrl)
  })

  afterEach(async function () {
    if (process.env.SELENIUM_BROWSER === 'chrome') {
      const errors = await checkBrowserForConsoleErrors(driver)
      if (errors.length) {
        const errorReports = errors.map(err => err.message)
        const errorMessage = `Errors found in browser console:\n${errorReports.join('\n')}`
        console.error(new Error(errorMessage))
      }
    }
    if (this.currentTest.state === 'failed') {
      await verboseReportOnFailure(driver, this.currentTest)
    }
  })

  after(async function () {
    await driver.quit()
  })

  describe('Going through the first time flow', () => {
    it('clicks the continue button on the welcome screen', async () => {
      const welcomeScreenBtn = await findElement(driver, By.css('.welcome-screen__button'))
      welcomeScreenBtn.click()
      await delay(largeDelayMs)
    })

    it('accepts a secure password', async () => {
      const passwordBox = await findElement(driver, By.css('.create-password #create-password'))
      const passwordBoxConfirm = await findElement(driver, By.css('.create-password #confirm-password'))
      const button = await findElement(driver, By.css('.create-password button'))

      await passwordBox.sendKeys('correct horse battery staple')
      await passwordBoxConfirm.sendKeys('correct horse battery staple')
      await button.click()
      await delay(regularDelayMs)
    })

    it('clicks through the unique image screen', async () => {
      const nextScreen = await findElement(driver, By.css('.unique-image button'))
      await nextScreen.click()
      await delay(regularDelayMs)
    })

    it('clicks through the ToS', async () => {
      // terms of use
      const canClickThrough = await driver.findElement(By.css('.tou button')).isEnabled()
      assert.equal(canClickThrough, false, 'disabled continue button')
      const bottomOfTos = await findElement(driver, By.linkText('Attributions'))
      await driver.executeScript('arguments[0].scrollIntoView(true)', bottomOfTos)
      await delay(regularDelayMs)
      const acceptTos = await findElement(driver, By.css('.tou button'))
      driver.wait(until.elementIsEnabled(acceptTos))
      await acceptTos.click()
      await delay(regularDelayMs)
    })

    it('clicks through the privacy notice', async () => {
      // privacy notice
      const nextScreen = await findElement(driver, By.css('.tou button'))
      await nextScreen.click()
      await delay(regularDelayMs)
    })

    it('clicks through the phishing notice', async () => {
      // phishing notice
      const noticeElement = await driver.findElement(By.css('.markdown'))
      await driver.executeScript('arguments[0].scrollTop = arguments[0].scrollHeight', noticeElement)
      await delay(regularDelayMs)
      const nextScreen = await findElement(driver, By.css('.tou button'))
      await nextScreen.click()
      await delay(regularDelayMs)
    })

    let seedPhrase

    it('reveals the seed phrase', async () => {
      const byRevealButton = By.css('.backup-phrase__secret-blocker .backup-phrase__reveal-button')
      await driver.wait(until.elementLocated(byRevealButton, 10000))
      const revealSeedPhraseButton = await findElement(driver, byRevealButton, 10000)
      await revealSeedPhraseButton.click()
      await delay(regularDelayMs)

      seedPhrase = await driver.findElement(By.css('.backup-phrase__secret-words')).getText()
      assert.equal(seedPhrase.split(' ').length, 12)
      await delay(regularDelayMs)

      const nextScreen = await findElement(driver, By.css('.backup-phrase button'))
      await nextScreen.click()
      await delay(regularDelayMs)
    })

    async function clickWordAndWait (word) {
      const xpathClass = 'backup-phrase__confirm-seed-option backup-phrase__confirm-seed-option--unselected'
      const xpath = `//button[@class='${xpathClass}' and contains(text(), '${word}')]`
      const word0 = await findElement(driver, By.xpath(xpath), 10000)

      await word0.click()
      await delay(tinyDelayMs)
    }

    async function retypeSeedPhrase (words, wasReloaded, count = 0) {
      try {
        if (wasReloaded) {
          const byRevealButton = By.css('.backup-phrase__secret-blocker .backup-phrase__reveal-button')
          await driver.wait(until.elementLocated(byRevealButton, 10000))
          const revealSeedPhraseButton = await findElement(driver, byRevealButton, 10000)
          await revealSeedPhraseButton.click()
          await delay(regularDelayMs)

          const nextScreen = await findElement(driver, By.css('.backup-phrase button'))
          await nextScreen.click()
          await delay(regularDelayMs)
        }

        for (let i = 0; i < 12; i++) {
          await clickWordAndWait(words[i])
        }
      } catch (e) {
        if (count > 2) {
          throw e
        } else {
          await loadExtension(driver, extensionId)
          await retypeSeedPhrase(words, true, count + 1)
        }
      }
    }

    it('can retype the seed phrase', async () => {
      const words = seedPhrase.split(' ')

      await retypeSeedPhrase(words)

      const confirm = await findElement(driver, By.xpath(`//button[contains(text(), 'Confirm')]`))
      await confirm.click()
      await delay(regularDelayMs)
    })

    it('clicks through the deposit modal', async () => {
      const byBuyModal = By.css('span .modal')
      const buyModal = await driver.wait(until.elementLocated(byBuyModal))
      const closeModal = await findElement(driver, By.css('.page-container__header-close'))
      await closeModal.click()
      await driver.wait(until.stalenessOf(buyModal))
      await delay(regularDelayMs)
    })
  })

  describe('Show account information', () => {
    it('show account details dropdown menu', async () => {
      await driver.findElement(By.css('div.menu-bar__open-in-browser')).click()
      const options = await driver.findElements(By.css('div.menu.account-details-dropdown div.menu__item'))
      assert.equal(options.length, 3) // HD Wallet type does not have to show the Remove Account option
      await delay(regularDelayMs)
    })
  })

  describe('Import seed phrase', () => {
    it('logs out of the vault', async () => {
      await driver.findElement(By.css('.account-menu__icon')).click()
      await delay(regularDelayMs)

      const logoutButton = await findElement(driver, By.css('.account-menu__logout-button'))
      assert.equal(await logoutButton.getText(), 'Log out')
      await logoutButton.click()
      await delay(regularDelayMs)
    })

    it('imports seed phrase', async () => {
      const restoreSeedLink = await findElement(driver, By.css('.unlock-page__link--import'))
      assert.equal(await restoreSeedLink.getText(), 'Import using account seed phrase')
      await restoreSeedLink.click()
      await delay(regularDelayMs)

      const seedTextArea = await findElement(driver, By.css('textarea'))
      await seedTextArea.sendKeys(testSeedPhrase)
      await delay(regularDelayMs)

      const passwordInputs = await driver.findElements(By.css('input'))
      await delay(regularDelayMs)

      await passwordInputs[0].sendKeys('correct horse battery staple')
      await passwordInputs[1].sendKeys('correct horse battery staple')
      await driver.findElement(By.css('.first-time-flow__button')).click()
      await delay(regularDelayMs)
    })

    it('switches to localhost', async () => {
      const networkDropdown = await findElement(driver, By.css('.network-name'))
      await networkDropdown.click()
      await delay(regularDelayMs)

      const [localhost] = await findElements(driver, By.xpath(`//span[contains(text(), 'Localhost')]`))
      await localhost.click()
      await delay(largeDelayMs * 2)
    })

    it('balance renders', async () => {
      const balance = await findElement(driver, By.css('.transaction-view-balance__primary-balance'))
      await driver.wait(until.elementTextMatches(balance, /100\s*ETH/))
      await delay(regularDelayMs)
    })
  })

  describe('Send ETH from inside MetaMask', () => {
    it('starts to send a transaction', async function () {
      const sendButton = await findElement(driver, By.xpath(`//button[contains(text(), 'Send')]`))
      await sendButton.click()
      await delay(regularDelayMs)

      const inputAddress = await findElement(driver, By.css('input[placeholder="Recipient Address"]'))
      const inputAmount = await findElement(driver, By.css('.unit-input__input'))
      await inputAddress.sendKeys('0x2f318C334780961FB129D2a6c30D0763d9a5C970')
      await inputAmount.sendKeys('1')

      const inputValue = await inputAmount.getAttribute('value')
      assert.equal(inputValue, '1')
    })

    it('opens and closes the gas modal', async function () {
      // Set the gas limit
      const configureGas = await findElement(driver, By.css('.advanced-gas-options-btn'))
      await configureGas.click()
      await delay(regularDelayMs)

      const gasModal = await driver.findElement(By.css('span .modal'))

      const save = await findElement(driver, By.xpath(`//button[contains(text(), 'Save')]`))
      await save.click()
      await driver.wait(until.stalenessOf(gasModal), 10000)
      await delay(regularDelayMs)
    })

    it('clicks through to the confirm screen', async function () {
      // Continue to next screen
      const nextScreen = await findElement(driver, By.xpath(`//button[contains(text(), 'Next')]`))
      await nextScreen.click()
      await delay(regularDelayMs)
    })

    it('confirms the transaction', async function () {
      const confirmButton = await findElement(driver, By.xpath(`//button[contains(text(), 'Confirm')]`))
      await confirmButton.click()
      await delay(largeDelayMs)
    })

    it('finds the transaction in the transactions list', async function () {
      const transactions = await findElements(driver, By.css('.transaction-list-item'))
      assert.equal(transactions.length, 1)

      if (process.env.SELENIUM_BROWSER !== 'firefox') {
        const txValues = await findElement(driver, By.css('.transaction-list-item__amount--primary'))
        await driver.wait(until.elementTextMatches(txValues, /-1\s*ETH/), 10000)
      }
    })
  })
})
