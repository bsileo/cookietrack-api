
// Imports:
import { minABI, curve } from '../../ABIs';
import { initResponse, query, addToken, addCurveToken } from '../../functions';
import type { Request } from 'express';
import type { Chain, Address, Token, LPToken } from 'cookietrack-types';

// Initializations:
const chain: Chain = 'poly';
const project = 'curve';
const pools: Address[] = [
  '0x3b6b158a76fd8ccc297538f454ce7b4787778c7c', // ATriCrypto Gauge
  '0x19793B454D3AfC7b454F206Ffe95aDE26cA6912c', // Aave Gauge
  '0xffbACcE0CC7C19d46132f1258FC16CF6871D153c', // renBTC Gauge
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