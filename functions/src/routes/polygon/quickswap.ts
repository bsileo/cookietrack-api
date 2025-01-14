
// Imports:
import { minABI, quickswap } from '../../ABIs';
import { initResponse, query, addToken, addLPToken } from '../../functions';
import type { Request } from 'express';
import type { Chain, Address, Token, LPToken } from 'cookietrack-types';

// Initializations:
const chain: Chain = 'poly';
const project = 'quickswap';
const registry: Address = '0x8aAA5e259F74c8114e0a471d9f2ADFc66Bfe09ed';
const dualRegistry: Address = '0x9Dd12421C637689c3Fc6e661C9e2f02C2F61b3Eb';
const quick: Address = '0x831753dd7087cac61ab5644b308642cc1c33dc13';
const dquick: Address = '0xf28164a485b0b2c90639e47b0f377b4a438a16b1';
const wmatic: Address = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270';
const minFarmCount = 125;
const minDualFarmCount = 5;

/* ========================================================================================================================================================================= */

// GET Function:
exports.get = async (req: Request): Promise<string> => {

  // Initializing Response:
  let response = initResponse(req);

  // Fetching Response Data:
  if(response.status === 'ok') {
    try {
      let wallet = req.query.address as Address;
      let farms = await getFarms();
      let dualFarms = await getDualFarms();
      let ratio = await getRatio();
      response.data.push(...(await getFarmBalances(wallet, farms, ratio)));
      response.data.push(...(await getDualFarmBalances(wallet, dualFarms, ratio)));
      response.data.push(...(await getStakedQUICK(wallet, ratio)));
    } catch(err: any) {
      console.error(err);
      response.status = 'error';
      response.data = [{error: 'Internal API Error'}];
    }
  }

  // Returning Response:
  return JSON.stringify(response, null, ' ');
}

/* ========================================================================================================================================================================= */

// Function to get all farm balances:
const getFarmBalances = async (wallet: Address, farms: Address[], ratio: number) => {
  let balances: (Token | LPToken)[] = [];
  let promises = farms.map(farm => (async () => {
    let balance = parseInt(await query(chain, farm, minABI, 'balanceOf', [wallet]));
    if(balance > 0) {
      let token = await query(chain, farm, quickswap.farmABI, 'stakingToken', []);
      let newToken = await addLPToken(chain, project, 'staked', token, balance, wallet);
      balances.push(newToken);

      // Pending QUICK Rewards:
      let rewards = parseInt(await query(chain, farm, quickswap.farmABI, 'earned', [wallet]));
      if(rewards > 0) {
        let newToken = await addToken(chain, project, 'unclaimed', quick, rewards * ratio, wallet);
        balances.push(newToken);
      }
    }
  })());
  await Promise.all(promises);
  return balances;
}

// Function to get all dual farm balances:
const getDualFarmBalances = async (wallet: Address, dualFarms: Address[], ratio: number) => {
  let balances: (Token | LPToken)[] = [];
  let promises = dualFarms.map(farm => (async () => {
    let balance = parseInt(await query(chain, farm, minABI, 'balanceOf', [wallet]));
    if(balance > 0) {
      let token = await query(chain, farm, quickswap.dualFarmABI, 'stakingToken', []);
      let newToken = await addLPToken(chain, project, 'staked', token, balance, wallet);
      balances.push(newToken);

      // Pending QUICK Rewards:
      let rewardsA = parseInt(await query(chain, farm, quickswap.dualFarmABI, 'earnedA', [wallet]));
      if(rewardsA > 0) {
        let newToken = await addToken(chain, project, 'unclaimed', quick, rewardsA * ratio, wallet);
        balances.push(newToken);
      }

      // Pending WMATIC Rewards:
      let rewardsB = parseInt(await query(chain, farm, quickswap.dualFarmABI, 'earnedB', [wallet]));
      if(rewardsB > 0) {
        let newToken = await addToken(chain, project, 'unclaimed', wmatic, rewardsB, wallet);
        balances.push(newToken);
      }
    }
  })());
  await Promise.all(promises);
  return balances;
}

// Function to get staked QUICK balance:
const getStakedQUICK = async (wallet: Address, ratio: number) => {
  let balance = parseInt(await query(chain, dquick, minABI, 'balanceOf', [wallet]));
  if(balance > 0) {
    let newToken = await addToken(chain, project, 'staked', quick, balance * ratio, wallet);
    return [newToken];
  } else {
    return [];
  }
}

// Function to get farms:
const getFarms = async () => {
  let farms: Address[] = [];
  let farmIDs = [...Array(minFarmCount + 1).keys()];
  let promises = farmIDs.map(id => (async () => {
    let stakingToken = await query(chain, registry, quickswap.registryABI, 'stakingTokens', [id]);
    let rewardsInfo = await query(chain, registry, quickswap.registryABI, 'stakingRewardsInfoByStakingToken', [stakingToken]);
    farms.push(rewardsInfo.stakingRewards);
  })());
  await Promise.all(promises);
  let i = minFarmCount;
  let maxReached = false;
  while(!maxReached) {
    let stakingToken = await query(chain, registry, quickswap.registryABI, 'stakingTokens', [++i]);
    if(stakingToken) {
      let rewardsInfo = await query(chain, registry, quickswap.registryABI, 'stakingRewardsInfoByStakingToken', [stakingToken]);
      farms.push(rewardsInfo.stakingRewards);
    } else {
      maxReached = true;
    }
  }
  return farms;
}

// Function to get dual reward farms:
const getDualFarms = async () => {
  let dualFarms: Address[] = [];
  let farmIDs = [...Array(minDualFarmCount + 1).keys()];
  let promises = farmIDs.map(id => (async () => {
    let stakingToken = await query(chain, dualRegistry, quickswap.dualRegistryABI, 'stakingTokens', [id]);
    let rewardsInfo = await query(chain, dualRegistry, quickswap.dualRegistryABI, 'stakingRewardsInfoByStakingToken', [stakingToken]);
    dualFarms.push(rewardsInfo.stakingRewards);
  })());
  await Promise.all(promises);
  let i = minDualFarmCount;
  let maxReached = false;
  while(!maxReached) {
    let stakingToken = await query(chain, dualRegistry, quickswap.dualRegistryABI, 'stakingTokens', [++i]);
    if(stakingToken) {
      let rewardsInfo = await query(chain, dualRegistry, quickswap.dualRegistryABI, 'stakingRewardsInfoByStakingToken', [stakingToken]);
      dualFarms.push(rewardsInfo.stakingRewards);
    } else {
      maxReached = true;
    }
  }
  return dualFarms;
}

// Function to get dQUICK ratio:
const getRatio = async () => {
  let ratio = parseInt(await query(chain, dquick, quickswap.stakingABI, 'dQUICKForQUICK', [100000000])) / (10 ** 8);
  return ratio;
}