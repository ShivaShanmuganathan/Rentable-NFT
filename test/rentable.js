// import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
const { expect } = require("chai");
const dayjs = require("dayjs");
const { BigNumber, constants } = require("ethers");
const { ethers, network  } = require("hardhat");


describe('Rentable NFT', () => {
  

  beforeEach(async () => {
    const signers = await ethers.getSigners()

    owner = signers[0]

    tokenOwner = signers[1]

    renter = signers[2]

    guy = signers[3]
    
    RentableNFT = await ethers.getContractFactory('RentableNFT', owner);
    rentableContract = await RentableNFT.deploy();
    await rentableContract.deployed();
    
  })

  it('Mint & Transfer', async () => {
    expect(await rentableContract.totalSupply()).to.eql(constants.Zero)

    await rentableContract.safeMint(tokenOwner.address)

    expect(await rentableContract.totalSupply())
      .to.eql(await rentableContract.balanceOf(tokenOwner.address))
      .to.eql(constants.One)

    expect(
      await rentableContract.connect(tokenOwner).transferFrom(tokenOwner.address, renter.address, 0)
    )
      .to.emit(rentableContract, 'Transfer')
      .withArgs(tokenOwner.address, renter.address, 0)

    expect(await rentableContract.totalSupply())
      .to.eql(await rentableContract.balanceOf(renter.address))
      .to.eql(constants.One)

    expect(await rentableContract.balanceOf(tokenOwner.address)).to.eql(constants.Zero)
  })

  describe('Rent Out & Finish Renting', () => {
    const expiresAt = dayjs().add(1, 'day').unix()

    beforeEach(async () => {
      await rentableContract.safeMint(tokenOwner.address)
      await rentableContract.safeMint(tokenOwner.address)
      await rentableContract.safeMint(tokenOwner.address)

      expect(await rentableContract.totalSupply())
        .to.eql(await rentableContract.balanceOf(tokenOwner.address))
        .to.eql(BigNumber.from(3))

      await expect(
        rentableContract.rentOut(renter.address, 1, expiresAt)
      ).to.be.revertedWith('ERC721: transfer of token that is not own')

      await expect(rentableContract.connect(tokenOwner).rentOut(renter.address, 1, expiresAt))
        .to.emit(rentableContract, 'Rented')
        .withArgs(1, tokenOwner.address, renter.address, expiresAt)

      expect(
        await Promise.all([
          rentableContract.totalSupply(),
          rentableContract.balanceOf(tokenOwner.address),
          rentableContract.balanceOf(renter.address),
          rentableContract.ownerOf(1)
        ])
      ).to.eql([
        BigNumber.from(3),
        constants.Two,
        constants.One,
        renter.address
      ])

      const rental = await rentableContract.rental(1)

      expect([
        rental.isActive,
        rental.tokenOwner,
        rental.renter,
        rental.expiresAt
      ]).to.eql([true, tokenOwner.address, renter.address, BigNumber.from(expiresAt)])

      await expect(
        rentableContract.connect(renter).transferFrom(renter.address, guy.address, 1)
      ).to.be.revertedWith('RentableNFT: this token is rented')

      await expect(rentableContract.finishRenting(1)).to.be.revertedWith(
        'RentableNFT: this token is rented'
      )
    })

    it('Early Finish', async () => {
      await expect(rentableContract.connect(renter).finishRenting(1))
        .to.emit(rentableContract, 'FinishedRent')
        .withArgs(1, tokenOwner.address, renter.address, expiresAt)
    })

    it('After Expiration', async () => {
      await network.provider.send('evm_setNextBlockTimestamp', [expiresAt])

      await expect(rentableContract.connect(guy).finishRenting(1))
        .to.emit(rentableContract, 'FinishedRent')
        .withArgs(1, tokenOwner.address, renter.address, expiresAt)
    })

    afterEach(async () => {
      expect(
        await Promise.all([
          rentableContract.totalSupply(),
          rentableContract.balanceOf(tokenOwner.address),
          rentableContract.balanceOf(renter.address),
          rentableContract.ownerOf(1)
        ])
      ).to.eql([
        BigNumber.from(3),
        BigNumber.from(3),
        constants.Zero,
        tokenOwner.address
      ])

      const rental = await rentableContract.rental(1)

      expect([
        rental.isActive,
        rental.tokenOwner,
        rental.renter,
        rental.expiresAt
      ]).to.eql([
        false,
        tokenOwner.address,
        renter.address,
        BigNumber.from(expiresAt)
      ])
    })
  })
})