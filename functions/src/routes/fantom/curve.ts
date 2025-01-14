
// Imports:
import { minABI, curve } from '../../ABIs';
import { initResponse, query, addToken, addCurveToken } from '../../functions';
import type { Request } from 'express';
import type { Chain, Address, Token, LPToken } from 'cookietrack-types';

// Initializations:
const chain: Chain = 'ftm';
const project = 'curve';
const pools: Address[] = [
  '0x8866414733F22295b7563f9C5299715D2D76CAf4', // 2pool Gauge
  '0x06e3C4da96fd076b97b7ca3Ae23527314b6140dF', // fUSDT Gauge
  '0xBdFF0C27dd073C119ebcb1299a68A6A92aE607F0', // renBTC Gauge
  '0x00702bbdead24c40647f235f15971db0867f6bdb', // TriCrypto Gauge
  '0xd4f94d0aaa640bbb72b5eec2d85f6d114d81a88e'  // Geist Gauge
];

/* ========================================================================================================================================================================= */

// GET Function:
exports.get = async (req: Request): Promise<string> => {

  // Initializing Response:
  let response = initResponse(req);

  // Fetching Response Data:
  if(response.status === 'ok') {
    try {
      let wallet = req.query.address as Address;
      response.data.push(...(await getPoolBalances(wallet)));
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

// Function to get pool balances:
const getPoolBalances = async (wallet: Address) => {
  let balances: (Token | LPToken)[] = [];
  let promises = pools.map(gauge => (async () => {
    let balance = parseInt(await query(chain, gauge, minABI, 'balanceOf', [wallet]));
    if(balance > 0) {
      let token = await query(chain, gauge, curve.gaugeABI, 'lp_token', []);
      let newToken = await addCurveToken(chain, project, 'staked', token, balance, wallet);
      balances.push(newToken);

      // Pending Rewards:
      for(let i = 0; i < 2; i++) {
        let token = await query(chain, gauge, curve.gaugeABI, 'reward_tokens', [i]);
        if(token != '0x0000000000000000000000000000000000000000') {
          let rewards = parseInt(await query(chain, gauge, curve.gaugeABI, 'claimable_reward', [wallet, token]));
          if(rewards > 0) {
            let newToken = await addToken(chain, project, 'unclaimed', token, rewards, wallet);
            balances.push(newToken);
          }
        }
      }
    }
  })());
  await Promise.all(promises);
  return balances;
}