const { ethers } = require('hardhat')
const { expect } = require('chai')

// Test helpers
function getExitBalance(amount) {
  const entryBalance = amount - amount * 0.01
  const exitBalance = entryBalance - entryBalance * 0.29

  return (amount - exitBalance).toString()
}

function bigNumber(bn) {
  return parseInt(bn._hex, 16)
}

// NOTE: ethersjs Full Transaction Response returns:
// - from
// - to
// - gasLimit, gasPrice
// - nonce
// - r, s, v
// - wait() => Promise that resolves the Transaction Receipt once mined
//             and rejects with an error is the stats is 0; the error
//             will have a transactionHash property as well as a
//             transaction property.

describe('NinetyDays', function () {
  it('Should handle challenge entry', async function () {
    const signers = await ethers.getSigners()
    const NinetyDays = await ethers.getContractFactory('NinetyDays', signers[0])
    const challenge = await NinetyDays.deploy()

    await challenge.deployed()

    await expect(
      challenge.enterChallenge(90, { value: ethers.utils.parseEther('0.005') })
    ).to.be.revertedWith('Minimum entry price is 0.01')
    await expect(
      challenge.enterChallenge(89, { value: ethers.utils.parseEther('0.01') })
    ).to.be.revertedWith('Minimum entry price is 0.05')
    expect(await challenge.isIncludedInChallenge(signers[0].address)).to.be
      .false

    expect(
      await challenge.enterChallenge(90, {
        value: ethers.utils.parseEther('0.01'),
      })
    )
      .to.be.an('object')
      .to.emit(challenge, 'ChallengeEntry')
      .withArgs(signers[0].address, '9900000000000000', 90)

    expect(await challenge.isIncludedInChallenge(signers[0].address)).to.be.true
    expect(await challenge.activeParticipantCount()).to.equal(1)
    await expect(
      challenge.enterChallenge(90, { value: ethers.utils.parseEther('0.01') })
    ).to.be.revertedWith('You already have entered the challenge')

    expect(
      await challenge
        .connect(signers[1])
        .enterChallenge(0, { value: ethers.utils.parseEther('0.01') })
    )
      .to.be.an('object')
      .to.emit(challenge, 'ChallengeEntry')
      .withArgs(signers[1].address, '9900000000000000', 90)

    expect(await challenge.isIncludedInChallenge(signers[1].address)).to.be.true
    expect(await challenge.activeParticipantCount()).to.equal(2)

    const info1 = await challenge.getChallenger(signers[1].address)

    expect(bigNumber(info1[0])).to.equal(9.9e15)
    expect(bigNumber(info1[1])).to.equal(90)
    expect(bigNumber(info1[3])).to.equal(90)

    expect(
      await challenge
        .connect(signers[2])
        .enterChallenge(89, { value: ethers.utils.parseEther('0.05') })
    )
      .to.be.an('object')
      .to.emit(challenge, 'ChallengeEntry')
      .withArgs(signers[2].address, '49500000000000000', 89)

    expect(await challenge.isIncludedInChallenge(signers[2].address)).to.be.true
    expect(await challenge.activeParticipantCount()).to.equal(3)

    const info2 = await challenge.getChallenger(signers[2].address)

    expect(bigNumber(info2[0])).to.equal(4.95e16)
    expect(bigNumber(info2[1])).to.equal(89)
    expect(bigNumber(info2[3])).to.equal(89)
  })

  it('Should handle account balance', async function () {
    const signers = await ethers.getSigners()
    const NinetyDays = await ethers.getContractFactory('NinetyDays')
    const challenge = await NinetyDays.deploy()

    await challenge.deployed()

    const contractAddress = challenge.address

    expect(
      await challenge.enterChallenge(0, {
        value: ethers.utils.parseEther('0.04'),
      })
    )
      .to.be.an('object')
      .to.emit(challenge, 'ChallengeEntry')
      .withArgs(signers[0].address, '39600000000000000', 90)

    expect(await challenge.totalFunds()).to.equal('40000000000000000')

    expect(await challenge.getChallengeBalanceOf(contractAddress)).to.equal(
      '400000000000000'
    )
    expect(await challenge.getChallengeBalanceOf(signers[0].address)).to.equal(
      '39600000000000000'
    )
    expect(await challenge.getChallengeBalanceOf(signers[1].address)).to.equal(
      '0'
    )
  })

  it('Should update challenge', async function () {
    const signers = await ethers.getSigners()
    const NinetyDays = await ethers.getContractFactory('NinetyDays')
    const challenge = await NinetyDays.deploy()

    await challenge.deployed()

    expect(
      await challenge.enterChallenge(0, {
        value: ethers.utils.parseEther('0.04'),
      })
    )
      .to.be.an('object')
      .to.emit(challenge, 'ChallengeEntry')
      .withArgs(signers[0].address, '39600000000000000', 90)

    // Show fail.
    await expect(challenge.updateDaysLeftInChallenge()).to.be.revertedWith(
      'Can not update temporally.'
    )

    // Increase 1 day.
    ethers.provider.send('evm_increaseTime', [86400])

    // Show success.
    expect(await challenge.updateDaysLeftInChallenge())
      .to.be.an('object')
      .to.emit(challenge, 'ChallengeUpdated')
      .withArgs(signers[0].address, 90, 89)

    // Show fail.
    await expect(challenge.updateDaysLeftInChallenge()).to.be.revertedWith(
      'Can not update temporally.'
    )

    ethers.provider.send('evm_increaseTime', [86400])

    expect(await challenge.updateDaysLeftInChallenge())
      .to.be.an('object')
      .to.emit(challenge, 'ChallengeUpdated')
      .withArgs(signers[0].address, 90, 88)

    const info = await challenge.getChallenger(
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
    )

    expect(bigNumber(info[3])).to.equal(88)
    expect(await challenge.activeParticipantCount()).to.equal(1)
  })

  it('Should finish challenge', async function () {
    const signers = await ethers.getSigners()
    const NinetyDays = await ethers.getContractFactory('NinetyDays')
    const challenge = await NinetyDays.deploy()

    await challenge.deployed()

    expect(
      await challenge.enterChallenge(3, {
        value: ethers.utils.parseEther('0.05'),
      })
    )
      .to.be.an('object')
      .to.emit(challenge, 'ChallengeEntry')
      .withArgs(signers[0].address, '49500000000000000', 3)

    // 1
    ethers.provider.send('evm_increaseTime', [86400])

    expect(await challenge.updateDaysLeftInChallenge()).to.be.an('object')

    // 2
    ethers.provider.send('evm_increaseTime', [86400])

    expect(await challenge.updateDaysLeftInChallenge())
      .to.be.an('object')
      .to.emit(challenge, 'ChallengeUpdated')
      .withArgs(signers[0].address, 3, 1)

    expect(
      await challenge.getChallengeBalanceOf(
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      )
    ).to.equal('49500000000000000')

    // 3
    ethers.provider.send('evm_increaseTime', [86400])

    expect(await challenge.updateDaysLeftInChallenge())
      .to.be.an('object')
      .to.emit(challenge, 'ChallengeUpdated')
      .withArgs(signers[0].address, 3, 0)
      .to.emit(challenge, 'ChallengeFinished')
      .withArgs(signers[0].address, 3, 0)

    expect(await challenge.activeParticipantCount()).to.equal(0)
    expect(
      await challenge.getChallengeBalanceOf(
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      )
    ).to.equal('0')
    expect(await challenge.totalFunds()).to.equal('500000000000000')
  })

  it('Should handle challenge exit', async function () {
    const signers = await ethers.getSigners()
    const NinetyDays = await ethers.getContractFactory('NinetyDays')
    const challenge = await NinetyDays.deploy()

    await challenge.deployed()

    expect(
      await challenge.enterChallenge(3, {
        value: ethers.utils.parseEther('0.05'),
      })
    ).to.be.an('object')

    // 1
    ethers.provider.send('evm_increaseTime', [86400])

    expect(await challenge.updateDaysLeftInChallenge())
      .to.be.an('object')
      .to.emit(challenge, 'ChallengeUpdated')
      .withArgs(signers[0].address, 3, 2)

    expect(await challenge.exitChallenge())
      .to.emit(challenge, 'ChallengeExit')
      .withArgs(signers[0].address, '35145000000000000', 2)

    expect(await challenge.activeParticipantCount()).to.equal(0)
    expect(
      await challenge.isIncludedInChallenge(
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      )
    ).to.be.false
    expect(
      await challenge.getChallengeBalanceOf(
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      )
    ).to.equal('0')

    expect(await challenge.totalFunds()).to.equal(getExitBalance(0.05e18))

    expect(await challenge.totalFunds()).to.equal('14855000000000000')

    expect(
      await challenge.enterChallenge(10, {
        value: ethers.utils.parseEther('0.05'),
      })
    ).to.be.an('object')

    // Increase 5 days.
    ethers.provider.send('evm_increaseTime', [86400 * 5])

    expect(await challenge.updateDaysLeftInChallenge())
      .to.be.an('object')
      .to.emit(challenge, 'ChallengeFinished')
      .withArgs(signers[0].address, 10, 10)

    expect(await challenge.activeParticipantCount()).to.equal(0)
    expect(
      await challenge.isIncludedInChallenge(
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      )
    ).to.be.false
    expect(
      await challenge.getChallengeBalanceOf(
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      )
    ).to.equal('0')

    // Old funds + recent funds.
    expect(await challenge.totalFunds()).to.equal('64855000000000000')
  })

  it('Should handle entry and exit balances ', async function () {
    const signers = await ethers.getSigners()
    const NinetyDays = await ethers.getContractFactory('NinetyDays')
    const challenge = await NinetyDays.deploy()

    await challenge.deployed()

    const contractAddress = challenge.address

    expect(
      await challenge.enterChallenge(0, {
        value: ethers.utils.parseEther('0.01'),
      })
    ).to.be.an('object')
    expect(
      await challenge
        .connect(signers[1])
        .enterChallenge(50, { value: ethers.utils.parseEther('0.05') })
    ).to.be.an('object')
    expect(
      await challenge
        .connect(signers[2])
        .enterChallenge(0, { value: ethers.utils.parseEther('1') })
    ).to.be.an('object')
    expect(
      await challenge
        .connect(signers[3])
        .enterChallenge(0, { value: ethers.utils.parseEther('0.5') })
    ).to.be.an('object')
    expect(
      await challenge
        .connect(signers[4])
        .enterChallenge(0, { value: ethers.utils.parseEther('0.25') })
    ).to.be.an('object')

    expect(await challenge.totalFunds()).to.equal('1810000000000000000')

    expect(await challenge.getChallengeBalanceOf(contractAddress)).to.equal(
      '18100000000000000'
    )
    expect(await challenge.getChallengeBalanceOf(signers[0].address)).to.equal(
      '9900000000000000'
    )
    expect(await challenge.getChallengeBalanceOf(signers[1].address)).to.equal(
      '49500000000000000'
    )
    expect(await challenge.getChallengeBalanceOf(signers[2].address)).to.equal(
      '990000000000000000'
    )
    expect(await challenge.getChallengeBalanceOf(signers[3].address)).to.equal(
      '495000000000000000'
    )
    expect(await challenge.getChallengeBalanceOf(signers[4].address)).to.equal(
      '247500000000000000'
    )
    expect(await challenge.getChallengeBalanceOf(signers[5].address)).to.equal(
      '0'
    )

    await challenge.connect(signers[0]).exitChallenge()
    await challenge.connect(signers[1]).exitChallenge()
    await challenge.connect(signers[2]).exitChallenge()
    await challenge.connect(signers[3]).exitChallenge()
    await challenge.connect(signers[4]).exitChallenge()

    // (total funds - 1%) - 29%
    expect(await challenge.totalFunds()).to.equal(getExitBalance(1.81e18))
    expect(await challenge.totalFunds()).to.equal('537751000000000000')
    expect(await challenge.totalBonus()).to.equal('519651000000000000')
  })

  it('Should handle challenge access', async function () {
    const signers = await ethers.getSigners()
    const NinetyDays = await ethers.getContractFactory('NinetyDays')
    const challenge = await NinetyDays.deploy()

    await challenge.deployed()

    expect(await challenge.updateChallengeAccess())
      .to.emit(challenge, 'ChallengeAccessUpdated')
      .withArgs(false)

    expect(await challenge.allowChallengeEntries()).to.be.false
    await expect(
      challenge.enterChallenge(0, { value: ethers.utils.parseEther('0.01') })
    ).to.be.revertedWith('Challenge is closed.')

    await expect(
      challenge.connect(signers[1]).updateChallengeAccess()
    ).to.be.revertedWith('You are not allowed to perform this action.')

    expect(await challenge.allowChallengeEntries()).to.be.false
    await expect(
      challenge
        .connect(signers[1])
        .enterChallenge(0, { value: ethers.utils.parseEther('0.01') })
    ).to.be.revertedWith('Challenge is closed.')

    expect(await challenge.connect(signers[0]).updateChallengeAccess())
      .to.emit(challenge, 'ChallengeAccessUpdated')
      .withArgs(true)

    expect(await challenge.allowChallengeEntries()).to.be.true
    expect(
      await challenge.enterChallenge(0, {
        value: ethers.utils.parseEther('0.01'),
      })
    ).to.be.an('object')
  })

  it('Should handle bonus distribution', async function () {
    const signers = await ethers.getSigners()
    const NinetyDays = await ethers.getContractFactory('NinetyDays')
    const challenge = await NinetyDays.deploy()

    await challenge.deployed()

    expect(
      await challenge.enterChallenge(0, {
        value: ethers.utils.parseEther('0.01'),
      })
    ).to.be.an('object')
    expect(
      await challenge
        .connect(signers[1])
        .enterChallenge(0, { value: ethers.utils.parseEther('1') })
    ).to.be.an('object')
    expect(
      await challenge
        .connect(signers[2])
        .enterChallenge(0, { value: ethers.utils.parseEther('1') })
    ).to.be.an('object')
    expect(
      await challenge
        .connect(signers[3])
        .enterChallenge(0, { value: ethers.utils.parseEther('1') })
    ).to.be.an('object')
    expect(
      await challenge
        .connect(signers[4])
        .enterChallenge(0, { value: ethers.utils.parseEther('1') })
    ).to.be.an('object')
    expect(
      await challenge
        .connect(signers[5])
        .enterChallenge(0, { value: ethers.utils.parseEther('1') })
    ).to.be.an('object')

    expect(await challenge.connect(signers[0]).totalFunds()).to.equal(
      '5010000000000000000'
    )
    expect(await challenge.connect(signers[0]).totalBonus()).to.equal(0)

    expect(await challenge.connect(signers[0]).exitChallenge())
      .to.emit(challenge, 'ChallengeExit')
      .withArgs(signers[0].address, '7029000000000000', 90)

    expect(await challenge.connect(signers[0]).totalFunds()).to.equal(
      '5002971000000000000'
    )
    expect(await challenge.connect(signers[0]).totalBonus()).to.equal(
      '2871000000000000'
    )

    expect(await challenge.connect(signers[1]).exitChallenge())
      .to.emit(challenge, 'ChallengeExit')
      .withArgs(signers[1].address, '702900000000000000', 90)
      .to.emit(challenge, 'BonusDistributed')
      .withArgs(4, '25000000000000000')

    expect(await challenge.connect(signers[1]).totalBonus()).to.equal(
      '189971000000000000'
    )
  })

  it('Should handle admin transfer', async function () {
    const signers = await ethers.getSigners()
    const NinetyDays = await ethers.getContractFactory('NinetyDays')
    const challenge = await NinetyDays.deploy()

    await challenge.deployed()

    expect(await challenge.updateChallengeAccess())
      .to.emit(challenge, 'ChallengeAccessUpdated')
      .withArgs(false)

    expect(await challenge.transferAdministration(signers[1].address))
      .to.emit(challenge, 'AdministrationTransferred')
      .withArgs(signers[0].address, signers[1].address)

    await expect(
      challenge.connect(signers[0]).updateChallengeAccess()
    ).to.be.revertedWith('You are not allowed to perform this action.')

    expect(await challenge.connect(signers[1]).updateChallengeAccess())
      .to.emit(challenge, 'ChallengeAccessUpdated')
      .withArgs(true)
  })

  it('Should distribute total bonus', async function () {
    const signers = await ethers.getSigners()
    const NinetyDays = await ethers.getContractFactory('NinetyDays')
    const challenge = await NinetyDays.deploy()

    await challenge.deployed()

    const contractAddress = challenge.address

    expect(
      await challenge.enterChallenge(0, {
        value: ethers.utils.parseEther('0.01'),
      })
    ).to.be.an('object')
    expect(
      await challenge
        .connect(signers[1])
        .enterChallenge(0, { value: ethers.utils.parseEther('1') })
    ).to.be.an('object')
    expect(
      await challenge
        .connect(signers[2])
        .enterChallenge(0, { value: ethers.utils.parseEther('1') })
    ).to.be.an('object')
    expect(
      await challenge
        .connect(signers[3])
        .enterChallenge(0, { value: ethers.utils.parseEther('1') })
    ).to.be.an('object')
    expect(
      await challenge
        .connect(signers[4])
        .enterChallenge(0, { value: ethers.utils.parseEther('1') })
    ).to.be.an('object')

    expect(await challenge.connect(signers[0]).exitChallenge())
      .to.emit(challenge, 'Transfer')
      .withArgs('7029000000000000', contractAddress, signers[0].address)
      .to.emit(challenge, 'ChallengeExit')
      .withArgs(signers[0].address, '7029000000000000', 90)

    expect(await challenge.connect(signers[0]).totalBonus()).to.equal(
      '2871000000000000'
    )

    await expect(
      challenge.connect(signers[1]).forceBonusDistribution()
    ).to.be.revertedWith('You are not allowed to perform this action.')

    expect(await challenge.connect(signers[0]).forceBonusDistribution())
      .to.emit(challenge, 'BonusDistributed')
      .withArgs(4, '717750000000000')

    expect(await challenge.getChallengeBalanceOf(signers[1].address)).to.equal(
      '990717750000000000'
    )
    expect(await challenge.getChallengeBalanceOf(signers[2].address)).to.equal(
      '990717750000000000'
    )
    expect(await challenge.getChallengeBalanceOf(signers[3].address)).to.equal(
      '990717750000000000'
    )
    expect(await challenge.getChallengeBalanceOf(signers[4].address)).to.equal(
      '990717750000000000'
    )

    await expect(
      challenge.connect(signers[0]).forceBonusDistribution()
    ).to.be.revertedWith('Insufficient bonus balance.')
  })

  it('Should withdraw fees', async function () {
    const signers = await ethers.getSigners()
    const NinetyDays = await ethers.getContractFactory('NinetyDays')
    const challenge = await NinetyDays.deploy()

    await challenge.deployed()

    const contractAddress = challenge.address

    await expect(challenge.takeFeesOut()).to.be.revertedWith(
      'Insufficient fees balance.'
    )
    await expect(
      challenge.connect(signers[1]).takeFeesOut()
    ).to.be.revertedWith('You are not allowed to perform this action.')

    expect(
      await challenge.enterChallenge(0, { value: ethers.utils.parseEther('1') })
    ).to.be.an('object')
    expect(
      await challenge
        .connect(signers[1])
        .enterChallenge(0, { value: ethers.utils.parseEther('1') })
    ).to.be.an('object')
    expect(
      await challenge
        .connect(signers[2])
        .enterChallenge(0, { value: ethers.utils.parseEther('1') })
    ).to.be.an('object')

    expect(await challenge.connect(signers[0]).takeFeesOut())
      .to.emit(challenge, 'Transfer')
      .withArgs('30000000000000000', contractAddress, signers[0].address)

    expect(await challenge.connect(signers[0]).totalFunds()).to.equal(
      '2970000000000000000'
    )
  })

  it('Should withdraw balance from contract', async function () {
    const signers = await ethers.getSigners()
    const NinetyDays = await ethers.getContractFactory('NinetyDays')
    const challenge = await NinetyDays.deploy()

    await challenge.deployed()

    const contractAddress = challenge.address

    expect(await challenge.provider.getBalance(contractAddress)).to.equal(0)

    await expect(challenge.withdraw()).to.be.revertedWith(
      'Insufficient contract balance.'
    )

    await signers[0].sendTransaction({
      to: contractAddress,
      value: ethers.utils.parseEther('1.0'),
    })

    expect(await challenge.provider.getBalance(contractAddress)).to.equal(
      '1000000000000000000'
    )

    await expect(challenge.connect(signers[1]).withdraw()).to.be.revertedWith(
      'You are not allowed to perform this action.'
    )

    expect(await challenge.withdraw())
      .to.emit(challenge, 'Transfer')
      .withArgs('1000000000000000000', contractAddress, signers[0].address)

    expect(await challenge.provider.getBalance(contractAddress)).to.equal(0)
  })
})
