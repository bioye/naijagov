package com.naijagov.naijagov.service;

import java.util.Optional;

import com.naijagov.naijagov.model.LocalGov;
import com.naijagov.naijagov.repository.LocalGovRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service("localGovService")
public class LocalGovService{
  private LocalGovRepository localGovRepository;

  public Optional<LocalGov> findLocalGov(int id) {
    return localGovRepository.findById(id);
  }

  public Page<LocalGov> listAllLocalGovs(Pageable page) {
    return localGovRepository.findAll(page);
  }

  @Autowired
  public LocalGovService(LocalGovRepository localGovRepository) {
    this.localGovRepository = localGovRepository;
  }
  

}